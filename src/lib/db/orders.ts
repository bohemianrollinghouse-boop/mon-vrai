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

export async function listOrders(opts: { status?: OrderStatus; limit?: number } = {}): Promise<Order[]> {
  let q = orders().orderBy("createdAt", "desc").limit(opts.limit ?? 100);
  if (opts.status) q = orders().where("status", "==", opts.status).orderBy("createdAt", "desc").limit(opts.limit ?? 100);
  return parseQuery(Order, q);
}

export async function listOrdersForCustomer(uid: string): Promise<Order[]> {
  return parseQuery(Order, orders().where("customerUid", "==", uid).orderBy("createdAt", "desc"));
}

export type PaidOrderInput = {
  lines: OrderLine[];
  totals: Order["totals"];
  email: string;
  customerUid?: string;
  shippingAddress: Address;
  billingAddress?: Address;
  stripe: { checkoutSessionId: string; paymentIntentId?: string; customerId?: string };
};

/**
 * Crée une commande payée. Idempotent sur `stripe.checkoutSessionId` : rappelé avec la
 * même session, renvoie la commande existante sans rien toucher.
 *
 * Le stock est décrémenté ici, au paiement, pas à l'ajout au panier : un panier
 * abandonné ne bloque jamais un exemplaire. Un stock qui passerait négatif est
 * accepté (le paiement est déjà encaissé) mais signalé dans le journal de la commande
 * pour qu'un humain tranche.
 */
export async function createPaidOrder(input: PaidOrderInput): Promise<Order> {
  const existing = await findOrderByCheckoutSession(input.stripe.checkoutSessionId);
  if (existing) return existing;

  const id = newId("ord");
  const createdAt = now();

  return db().runTransaction(async (tx) => {
    // Relecture dans la transaction : un webhook concurrent ne doit pas passer.
    const dup = await tx.get(orders().where("stripe.checkoutSessionId", "==", input.stripe.checkoutSessionId).limit(1));
    const dupDoc = dup.docs[0];
    if (dupDoc) {
      const found = parseDoc(Order, dupDoc);
      if (found) return found;
    }

    const counterRef = counters().doc("orders");
    const counterSnap = await tx.get(counterRef);
    const seq = ((counterSnap.data()?.seq as number | undefined) ?? 0) + 1;

    const notes: string[] = [];
    for (const line of input.lines) {
      const ref = col("products").doc(line.productSlug);
      const product = parseDoc(Product, await tx.get(ref));
      if (!product) {
        notes.push(`Produit ${line.productSlug} introuvable au moment du paiement`);
        continue;
      }
      if (product.stock !== null) {
        const remaining = product.stock - line.qty;
        if (remaining < 0) notes.push(`Stock négatif pour ${line.productSlug} (${remaining})`);
        tx.update(ref, { stock: FieldValue.increment(-line.qty), updatedAt: createdAt });
      }
    }

    const order = Order.parse({
      id,
      number: formatOrderNumber(seq, createdAt),
      status: "paid",
      lines: input.lines,
      totals: input.totals,
      customerUid: input.customerUid,
      email: input.email,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
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
      for (const line of order.lines) {
        const pref = col("products").doc(line.productSlug);
        const product = parseDoc(Product, await tx.get(pref));
        if (product && product.stock !== null) {
          tx.update(pref, { stock: FieldValue.increment(line.qty), updatedAt: now() });
        }
      }
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

    const counterRef = counters().doc("invoices");
    const seq = (((await tx.get(counterRef)).data()?.seq as number | undefined) ?? 0) + 1;
    const issuedAt = now();

    const updated = Order.parse({
      ...order,
      invoice: { number: formatInvoiceNumber(seq, issuedAt), issuedAt },
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

export async function setTracking(id: string, tracking: NonNullable<Order["tracking"]>): Promise<void> {
  await orders().doc(id).update({ tracking, updatedAt: now() });
}
