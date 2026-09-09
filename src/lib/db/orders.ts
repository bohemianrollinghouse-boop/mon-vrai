import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { assertTransition, formatInvoiceNumber, formatOrderNumber, stockIsReserved } from "@/lib/domain/order-state";
import { Order, Product, type Address, type OrderLine, type OrderStatus } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Commandes. Le point délicat est la création après paiement : décrémenter le stock,
 * attribuer un numéro séquentiel et écrire la commande doivent réussir ou échouer
 * ensemble. Une transaction Firestore garantit cet atomicité ; l'idempotence sur
 * l'identifiant de session Stripe garantit qu'un webhook rejoué ne crée pas de
 * doublon.
 */

const orders = () => col("orders");
const counters = () => col("counters");

export async function getOrder(id: string): Promise<Order | null> {
  return parseDoc(Order, await orders().doc(id).get());
}

export async function findOrderByCheckoutSession(sessionId: string): Promise<Order | null> {
  const snap = await orders().where("stripe.checkoutSessionId", "==", sessionId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? parseDoc(Order, doc) : null;
}

export async function findOrderByPaymentIntent(intentId: string): Promise<Order | null> {
  const snap = await orders().where("stripe.paymentIntentId", "==", intentId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? parseDoc(Order, doc) : null;
}

/** Clé d'idempotence d'une commande : la session Checkout si elle existe, sinon le PaymentIntent. */
function idempotencyField(stripe: PaidOrderInput["stripe"]): { field: string; value: string } {
  if (stripe.checkoutSessionId) return { field: "stripe.checkoutSessionId", value: stripe.checkoutSessionId };
  if (stripe.paymentIntentId) return { field: "stripe.paymentIntentId", value: stripe.paymentIntentId };
  throw new Error("Une commande payée doit référencer une session Checkout ou un PaymentIntent");
}

export async function listOrders(opts: { status?: OrderStatus; limit?: number } = {}): Promise<Order[]> {
  let q = orders().orderBy("createdAt", "desc").limit(opts.limit ?? 100);
  if (opts.status) q = orders().where("status", "==", opts.status).orderBy("createdAt", "desc").limit(opts.limit ?? 100);
  return parseQuery(Order, q);
}

/** Commandes d'une adresse e-mail (quelques unités) : tri en mémoire, pas d'index composite à entretenir. */
export async function listOrdersForEmail(email: string): Promise<Order[]> {
  const list = await parseQuery(Order, orders().where("email", "==", email.toLowerCase()).limit(200));
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/** Ajoute une note interne au journal, sans changer le statut. */
export async function addOrderNote(id: string, note: string, by: string): Promise<void> {
  const ref = orders().doc(id);
  const order = parseDoc(Order, await ref.get());
  if (!order) throw new Error(`Commande ${id} introuvable`);
  const at = now();
  await ref.update({ timeline: [...order.timeline, { at, status: order.status, note, by }], updatedAt: at });
}

export async function listOrdersForCustomer(uid: string): Promise<Order[]> {
  return parseQuery(Order, orders().where("customerUid", "==", uid).orderBy("createdAt", "desc"));
}

/*
 * Commandes d'un client connecté : celles rattachées à son compte (uid) ET celles passées
 * en invité avec son adresse e-mail. L'appelant ne passe l'e-mail que s'il est VÉRIFIÉ
 * (SessionUser.emailVerified) : sinon, créer un compte avec l'adresse d'un tiers suffirait
 * à lire ses commandes. Union dédupliquée.
 */
export async function listOrdersForUser(uid: string, verifiedEmail?: string): Promise<Order[]> {
  const [byUid, byEmail] = await Promise.all([
    listOrdersForCustomer(uid).catch(() => [] as Order[]),
    verifiedEmail ? listOrdersForEmail(verifiedEmail).catch(() => [] as Order[]) : Promise.resolve([] as Order[]),
  ]);
  const map = new Map<string, Order>();
  for (const o of [...byUid, ...byEmail]) map.set(o.id, o);
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export type PaidOrderInput = {
  lines: OrderLine[];
  totals: Order["totals"];
  email: string;
  customerUid?: string;
  shippingAddress: Address;
  billingAddress?: Address;
  stripe: { checkoutSessionId?: string; paymentIntentId?: string; customerId?: string };
  livemode?: boolean;
  delivery?: Order["delivery"];
  promoCodes?: string[];
  attribution?: Order["attribution"];
};

/**
 * Crée une commande payée. Idempotent sur la session Checkout ou, à défaut, sur le
 * PaymentIntent : rappelé avec le même identifiant, renvoie la commande existante.
 *
 * Le stock est décrémenté ici, au paiement, pas à l'ajout au panier : un panier
 * abandonné ne bloque jamais un exemplaire. Un stock qui passerait négatif est
 * accepté (le paiement est déjà encaissé) mais signalé dans le journal de la commande
 * pour qu'un humain tranche.
 */
export async function createPaidOrder(input: PaidOrderInput): Promise<Order> {
  const key = idempotencyField(input.stripe);
  const existing = input.stripe.checkoutSessionId ? await findOrderByCheckoutSession(input.stripe.checkoutSessionId) : await findOrderByPaymentIntent(key.value);
  if (existing) return existing;

  const id = newId("ord");
  const createdAt = now();

  return db().runTransaction(async (tx) => {
    // Relecture dans la transaction : un webhook concurrent ne doit pas passer.
    const dup = await tx.get(orders().where(key.field, "==", key.value).limit(1));
    const dupDoc = dup.docs[0];
    if (dupDoc) {
      const found = parseDoc(Order, dupDoc);
      if (found) return found;
    }

    const counterRef = counters().doc("orders");
    const counterSnap = await tx.get(counterRef);
    const seq = ((counterSnap.data()?.seq as number | undefined) ?? 0) + 1;

    // Firestore exige que TOUTES les lectures d'une transaction précèdent la première
    // écriture : on lit d'abord chaque produit, puis seulement on décrémente. Lire et
    // écrire ligne par ligne faisait échouer toute commande de deux produits ou plus.
    const notes: string[] = [];
    const productRefs = input.lines.map((line) => col("products").doc(line.productSlug));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
    input.lines.forEach((line, i) => {
      const product = parseDoc(Product, productSnaps[i]);
      if (!product) {
        notes.push(`Produit ${line.productSlug} introuvable au moment du paiement`);
        return;
      }
      if (product.stock !== null) {
        const remaining = product.stock - line.qty;
        if (remaining < 0) notes.push(`Stock négatif pour ${line.productSlug} (${remaining})`);
        tx.update(productRefs[i], { stock: FieldValue.increment(-line.qty), updatedAt: createdAt });
      }
    });

    const order = Order.parse({
      id,
      number: formatOrderNumber(seq, createdAt),
      status: "paid",
      lines: input.lines,
      totals: input.totals,
      customerUid: input.customerUid,
      // E-mail en minuscules : le rattachement des commandes invité à un compte se fait par e-mail.
      email: input.email.trim().toLowerCase(),
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      livemode: input.livemode ?? true,
      delivery: input.delivery,
      promoCodes: input.promoCodes ?? [],
      attribution: input.attribution,
      stripe: input.stripe,
      timeline: [
        { at: createdAt, status: "paid", note: notes.length ? notes.join(" · ") : undefined, by: "stripe" },
      ],
      createdAt,
      updatedAt: createdAt,
    });

    tx.set(counterRef, { seq }, { merge: true });
    tx.set(orders().doc(id), order);
    return order;
  });
}

/** Change le statut en respectant la machine à états, et rend le stock si l'on annule après paiement. */
export async function transitionOrder(id: string, to: OrderStatus, opts: { note?: string; by?: string } = {}): Promise<Order> {
  return db().runTransaction(async (tx) => {
    const ref = orders().doc(id);
    const order = parseDoc(Order, await tx.get(ref));
    if (!order) throw new Error(`Commande ${id} introuvable`);
    assertTransition(order.status, to);

    const releasing = stockIsReserved(order.status) && !stockIsReserved(to);
    if (releasing) {
      // Toutes les lectures avant la première écriture (contrainte Firestore, voir createPaidOrder).
      const prefs = order.lines.map((line) => col("products").doc(line.productSlug));
      const snaps = await Promise.all(prefs.map((pref) => tx.get(pref)));
      order.lines.forEach((line, i) => {
        const product = parseDoc(Product, snaps[i]);
        if (product && product.stock !== null) {
          tx.update(prefs[i], { stock: FieldValue.increment(line.qty), updatedAt: now() });
        }
      });
    }

    const at = now();
    const updated = Order.parse({
      ...order,
      status: to,
      timeline: [...order.timeline, { at, status: to, note: opts.note, by: opts.by }],
      updatedAt: at,
    });
    tx.set(ref, updated);
    return updated;
  });
}

/**
 * Attribue un numéro de facture séquentiel et sans trou. Idempotent : une commande
 * déjà facturée garde son numéro. Le PDF est généré à part ; ici on ne réserve que
 * le numéro, seule opération qui exige la transaction.
 */
export async function assignInvoiceNumber(id: string): Promise<Order> {
  return db().runTransaction(async (tx) => {
    const ref = orders().doc(id);
    const order = parseDoc(Order, await tx.get(ref));
    if (!order) throw new Error(`Commande ${id} introuvable`);
    if (order.invoice) return order;
    if (order.status === "pending_payment" || order.status === "cancelled") {
      throw new Error(`Pas de facture pour une commande ${order.status}`);
    }
    // Les commandes de test ont leur propre compteur et un préfixe F-TEST- : la
    // séquence légale (sans trou) n'est jamais entamée par un essai.
    const test = !order.livemode;
    const counterRef = counters().doc(test ? "invoices_test" : "invoices");
    const seq = (((await tx.get(counterRef)).data()?.seq as number | undefined) ?? 0) + 1;
    const issuedAt = now();

    const updated = Order.parse({
      ...order,
      invoice: { number: formatInvoiceNumber(seq, issuedAt, test), issuedAt },
      updatedAt: issuedAt,
    });
    tx.set(counterRef, { seq }, { merge: true });
    tx.set(ref, updated);
    return updated;
  });
}

export async function setInvoiceFile(id: string, storagePath: string): Promise<void> {
  await orders().doc(id).update({ "invoice.storagePath": storagePath, updatedAt: now() });
}

/** Rattache la facture Tiime (numéro + PDF déposé) à la commande. */
export async function setInvoiceDoc(id: string, invoice: { number: string; issuedAt: number; storagePath: string }): Promise<void> {
  await orders().doc(id).update({ invoice, updatedAt: now() });
}

export async function setTracking(id: string, tracking: NonNullable<Order["tracking"]>): Promise<void> {
  await orders().doc(id).update({ tracking, updatedAt: now() });
}

export async function setBoxtal(id: string, boxtal: NonNullable<Order["boxtal"]>): Promise<void> {
  await orders().doc(id).update({ boxtal, updatedAt: now() });
}

export async function findOrderByBoxtalId(boxtalOrderId: string): Promise<Order | null> {
  const snap = await orders().where("boxtal.orderId", "==", boxtalOrderId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? parseDoc(Order, doc) : null;
}

export async function setTiime(id: string, tiime: NonNullable<Order["tiime"]>): Promise<void> {
  await orders().doc(id).update({ tiime, updatedAt: now() });
}
