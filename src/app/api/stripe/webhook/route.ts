import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { clearCart } from "@/lib/db/carts";
import { ensureCustomer } from "@/lib/db/customers";
import { createPaidOrder, findOrderByCheckoutSession } from "@/lib/db/orders";
import { getProductsBySlugs } from "@/lib/db/products";
import type { Address, OrderLine } from "@/lib/domain/types";
import { sendOrderConfirmation } from "@/lib/email/send";
import { issueInvoice } from "@/lib/invoice/issue";
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

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return NextResponse.json({ received: true, ignored: "not paid" });

    if (await findOrderByCheckoutSession(session.id)) return NextResponse.json({ received: true, duplicate: true });

    const order = await createPaidOrder({ ...(await orderInputFrom(stripe, session)), livemode: event.livemode });

    const cartId = session.metadata?.cartId;
    if (cartId) await clearCart(cartId).catch(() => undefined);

    // La facture est émise au paiement ; si elle échoue ici, la route /api/factures la
    // rattrape à la première consultation, avec le même compteur. Jamais pour une
    // commande de test : la numérotation comptable doit rester propre.
    const invoiced = event.livemode
      ? await issueInvoice(order.id).catch((err) => {
          console.warn("[stripe] facture non émise :", err);
          return order;
        })
      : order;

    await sendOrderConfirmation(invoiced).catch((err) => console.warn("[stripe] e-mail de confirmation non envoyé :", err));
    return NextResponse.json({ received: true, order: order.number });
  }

  return NextResponse.json({ received: true });
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

async function orderInputFrom(stripe: Stripe, session: Stripe.Checkout.Session) {
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
