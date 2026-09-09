import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { clearCart } from "@/lib/db/carts";
import { addAddress, ensureCustomer } from "@/lib/db/customers";
import { createPaidOrder, findOrderByCheckoutSession, findOrderByPaymentIntent, type PaidOrderInput } from "@/lib/db/orders";
import { getProductsBySlugs } from "@/lib/db/products";
import { incrementPromoUses } from "@/lib/db/promos";
import type { Address, OrderLine } from "@/lib/domain/types";
import { sendOrderConfirmation } from "@/lib/email/send";
import { issueInvoice } from "@/lib/invoice/issue";
import { makeConfigured, sendOrderToMake } from "@/lib/make/tiime";
import { getStripe, webhookSecret, type PaymentMode } from "@/lib/stripe/client";

/*
 * Webhook Stripe. C'est ici qu'une commande naît — jamais sur la page de retour, que
 * le client peut fermer ou rafraîchir. Trois garde-fous :
 *  1. la signature : on ne traite que ce que Stripe a réellement envoyé ;
 *  2. l'idempotence : Stripe rejoue les événements, createPaidOrder ne crée qu'une fois ;
 *  3. la réponse 200 rapide : tout ce qui peut échouer après la création (facture,
 *     e-mail) est isolé pour ne pas provoquer de rejeu inutile.
 */

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });

  // Deux points de terminaison Stripe (live et test) visent cette même URL, chacun avec
  // son secret : on essaie les deux, et l'événement lui-même dit de quel mode il vient.
  const payload = await request.text();
  const verified = verify(payload, signature);
  if (!verified) return NextResponse.json({ error: "Signature invalide ou Stripe non configuré" }, { status: 400 });
  const { event } = verified;
  const mode: PaymentMode = event.livemode ? "live" : "test";
  const stripe = getStripe(mode);
  if (!stripe) return NextResponse.json({ error: `Stripe ${mode} non configuré` }, { status: 503 });

  // Paiement intégré au site (page /commande) : la commande naît du PaymentIntent.
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    if (intent.metadata?.source !== "monvrai-checkout") return NextResponse.json({ received: true, ignored: "not ours" });
    if (await findOrderByPaymentIntent(intent.id)) return NextResponse.json({ received: true, duplicate: true });

    const input = await orderInputFromIntent(intent);
    const order = await createPaidOrder({ ...input, livemode: event.livemode });
    return finish(order, intent.metadata?.cartId, input);
  }

  // Ancien parcours Stripe Checkout (page hébergée par Stripe) : conservé par prudence.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return NextResponse.json({ received: true, ignored: "not paid" });

    if (await findOrderByCheckoutSession(session.id)) return NextResponse.json({ received: true, duplicate: true });

    const input = await orderInputFrom(stripe, session);
    const order = await createPaidOrder({ ...input, livemode: event.livemode });
    return finish(order, session.metadata?.cartId, input);
  }

  return NextResponse.json({ received: true });
}

/** Suites communes d'une commande créée : vider le panier, facturer, prévenir, mémoriser l'adresse. */
async function finish(order: Awaited<ReturnType<typeof createPaidOrder>>, cartId: string | undefined, input: PaidOrderInput) {
  if (cartId) await clearCart(cartId).catch(() => undefined);
  if (input.customerUid) await addAddress(input.customerUid, input.shippingAddress).catch(() => undefined);
  if (input.promoCodes?.length) await incrementPromoUses(input.promoCodes).catch(() => undefined);

  // La facture est émise au paiement ; si elle échoue ici, la route /api/factures la
  // rattrape à la première consultation, avec le même compteur. Les commandes de test
  // reçoivent une facture F-TEST- (compteur distinct : la séquence légale est préservée).
  const invoiced = await issueInvoice(order.id).catch((err) => {
    console.warn("[stripe] facture non émise :", err);
    return order;
  });

  await sendOrderConfirmation(invoiced).catch((err) => console.warn("[stripe] e-mail de confirmation non envoyé :", err));
  // Facturation Tiime via Make : en dernier, sans jamais faire échouer le webhook. Les
  // commandes de test partent aussi (drapeau test dans le corps) pour un essai complet.
  if (makeConfigured()) await sendOrderToMake(order.id, "stripe").catch((err) => console.warn("[stripe] envoi Make/Tiime :", err));
  return NextResponse.json({ received: true, order: order.number });
}

/** Commande depuis un PaymentIntent de la page /commande : tout est dans ses métadonnées. */
async function orderInputFromIntent(intent: Stripe.PaymentIntent): Promise<PaidOrderInput> {
  const meta = intent.metadata ?? {};
  const snapshot = safeJson<{ s: string; q: number; p: number; g?: number }[]>(meta.cart, []);
  const products = await getProductsBySlugs(snapshot.map((l) => l.s));
  const lines: OrderLine[] = snapshot.map((l) => {
    const known = products.get(l.s);
    return { productSlug: l.s, title: known?.title ?? l.s, qty: l.q, unitPrice: l.p, image: known?.images[0], preorder: known?.preorder.enabled ?? false, gift: l.g === 1 };
  });

  const ship = intent.shipping;
  const shippingAddress: Address = {
    name: ship?.name ?? "Client",
    line1: ship?.address?.line1 ?? "",
    line2: ship?.address?.line2 ?? undefined,
    postalCode: ship?.address?.postal_code ?? "",
    city: ship?.address?.city ?? "",
    country: ship?.address?.country ?? "FR",
    phone: ship?.phone ?? undefined,
  };

  // Adresse de facturation : notre saisie, transmise par les métadonnées (prioritaire sur
  // ce que le moyen de paiement aurait pu renvoyer). Le téléphone reste celui du contact.
  let billingAddress: Address | undefined;
  if (meta.billingSame !== "1") {
    const b = safeJson<{ firstName: string; lastName: string; line1: string; line2?: string; postalCode: string; city: string; country: string } | null>(meta.billing, null);
    if (b?.line1) {
      billingAddress = { name: `${b.firstName} ${b.lastName}`.trim() || shippingAddress.name, line1: b.line1, line2: b.line2 || undefined, postalCode: b.postalCode, city: b.city, country: b.country, phone: shippingAddress.phone };
    }
  }

  const email = meta.email || intent.receipt_email || "";
  const customerUid = meta.customerUid || undefined;
  if (customerUid && email) await ensureCustomer(customerUid, email, shippingAddress.name).catch(() => undefined);

  const n = (v: string | undefined) => Number(v ?? 0) || 0;
  const relay = safeJson<{ code: string; name: string; street?: string; postalCode?: string; city?: string; network?: string } | null>(meta.relay, null);
  const delivery = meta.rateId
    ? { rateId: meta.rateId, rateName: meta.rateName ?? "", offerCode: meta.offerCode ?? "", relay: relay?.code ? { code: relay.code, name: relay.name, street: relay.street ?? "", postalCode: relay.postalCode ?? "", city: relay.city ?? "", network: relay.network ?? "" } : undefined }
    : undefined;
  const promoCodes = safeJson<string[]>(meta.promoCodes, []);
  const attribution = safeJson<{ influencerId: string; via: "code" | "link" } | null>(meta.attribution, null) ?? undefined;
  return {
    delivery,
    promoCodes,
    attribution,
    lines,
    totals: { subtotal: n(meta.subtotal), shipping: n(meta.shipping), discount: n(meta.discount), tax: 0, total: intent.amount_received || intent.amount, currency: "eur" as const },
    email,
    customerUid,
    shippingAddress,
    billingAddress,
    stripe: { paymentIntentId: intent.id, customerId: typeof intent.customer === "string" ? intent.customer : intent.customer?.id },
  };
}

function safeJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}


function verify(payload: string, signature: string): { event: Stripe.Event } | null {
  for (const mode of ["live", "test"] as const) {
    const stripe = getStripe(mode);
    const secret = webhookSecret(mode);
    if (!stripe || !secret) continue;
    try {
      return { event: stripe.webhooks.constructEvent(payload, signature, secret) };
    } catch {
      // Pas ce secret : on essaie le suivant.
    }
  }
  console.warn("[stripe] signature invalide pour tous les secrets connus");
  return null;
}

async function orderInputFrom(stripe: Stripe, session: Stripe.Checkout.Session): Promise<PaidOrderInput> {
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100, expand: ["data.price.product"] });

  const slugs = items.data
    .map((li) => (li.price?.product as Stripe.Product | undefined)?.metadata?.slug)
    .filter((s): s is string => Boolean(s));
  const products = await getProductsBySlugs(slugs);

  const lines: OrderLine[] = items.data.map((li) => {
    const product = li.price?.product as Stripe.Product;
    const slug = product.metadata?.slug ?? "";
    const known = products.get(slug);
    return {
      productSlug: slug || "inconnu",
      title: known?.title ?? product.name,
      qty: li.quantity ?? 1,
      unitPrice: li.price?.unit_amount ?? 0,
      image: known?.images[0],
      preorder: known?.preorder.enabled ?? false,
      gift: false,
    };
  });

  // Selon la version d'API du point de terminaison, l'adresse est dans collected_information
  // (versions récentes) ou directement sur la session (anciennes) : on accepte les deux.
  const legacy = (session as unknown as { shipping_details?: Stripe.Checkout.Session.CollectedInformation.ShippingDetails | null }).shipping_details;
  const details = session.collected_information?.shipping_details ?? legacy ?? null;
  const addr = details?.address;
  const shippingAddress: Address = {
    name: details?.name ?? session.customer_details?.name ?? "Client",
    line1: addr?.line1 ?? "",
    line2: addr?.line2 ?? undefined,
    postalCode: addr?.postal_code ?? "",
    city: addr?.city ?? "",
    country: addr?.country ?? "FR",
    phone: session.customer_details?.phone ?? undefined,
  };

  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const customerUid = session.metadata?.customerUid || undefined;
  if (customerUid && email) await ensureCustomer(customerUid, email, shippingAddress.name).catch(() => undefined);

  return {
    lines,
    totals: {
      subtotal: session.amount_subtotal ?? 0,
      shipping: session.total_details?.amount_shipping ?? 0,
      discount: session.total_details?.amount_discount ?? 0,
      tax: session.total_details?.amount_tax ?? 0,
      total: session.amount_total ?? 0,
      currency: "eur" as const,
    },
    email,
    customerUid,
    shippingAddress,
    stripe: {
      checkoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
    },
  };
}
