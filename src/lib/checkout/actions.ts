"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import type Stripe from "stripe";
import { getStripe, paymentMethodConfig } from "@/lib/stripe/client";
import { createPaidOrder, type PaidOrderInput } from "@/lib/db/orders";
import { getProductsBySlugs } from "@/lib/db/products";
import type { Address, OrderLine } from "@/lib/domain/types";
import { fulfillOrder } from "./fulfill";
import { buildQuote, quoteTotal } from "./quote";

/*
 * Création du PaymentIntent, au moment où le client clique « Payer » : on recalcule le
 * devis côté serveur (prix courants, remise, port), on y attache tout ce que le webhook
 * devra savoir pour créer la commande (lignes figées, adresse, e-mail, port, remise),
 * et on renvoie le client_secret. Le navigateur ne fixe jamais un montant.
 */

const AddressInput = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(60),
  lastName: z.string().trim().min(1, "Nom requis").max(60),
  line1: z.string().trim().min(3, "Adresse requise").max(120),
  line2: z.string().trim().max(120).default(""),
  postalCode: z.string().trim().min(4, "Code postal requis").max(10),
  city: z.string().trim().min(1, "Ville requise").max(80),
  country: z.string().length(2),
  phone: z.string().trim().min(1, "Téléphone requis").max(30),
});

// Adresse de facturation distincte (sans téléphone : on garde celui du contact/livraison).
const BillingInput = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).default(""),
  postalCode: z.string().trim().min(4).max(10),
  city: z.string().trim().min(1).max(80),
  country: z.string().length(2),
});

const RelayInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1).max(120),
  street: z.string().max(120).default(""),
  postalCode: z.string().max(10).default(""),
  city: z.string().max(80).default(""),
  network: z.string().max(40).default(""),
});

const Input = z.object({
  email: z.email("E-mail invalide"),
  shippingUpdates: z.boolean().default(true),
  rateId: z.string().min(1),
  billingSame: z.boolean().default(true),
  address: AddressInput,
  billing: BillingInput.nullable().optional(),
  relay: RelayInput.nullable().optional(),
});
export type CheckoutInput = z.input<typeof Input>;

export type IntentResult = { ok: true; clientSecret: string; amount: number; intentId: string } | { ok: false; error: string; field?: string };

export async function createPaymentIntentAction(raw: CheckoutInput): Promise<IntentResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Formulaire incomplet", field: issue?.path.join(".") };
  }
  const d = parsed.data;

  const settings = await getSettings();
  const mode = settings.payments.mode;
  const stripe = getStripe(mode);
  if (!stripe) return { ok: false, error: `Le paiement n'est pas activé (clés Stripe ${mode} manquantes).` };
  if (!settings.shipping.countries.includes(d.address.country)) return { ok: false, error: "Nous ne livrons pas encore ce pays.", field: "address.country" };

  const { quote } = await buildQuote(mode, d.email);
  if (!quote.cartId || quote.lines.length === 0) return { ok: false, error: "Votre panier est vide." };
  const { shipping, total } = quoteTotal(quote, d.rateId);
  if (total < 50) return { ok: false, error: "Montant trop faible pour un paiement par carte." };
  if (shipping.relay && !d.relay) return { ok: false, error: "Choisissez votre point relais sur la carte avant de payer.", field: "relay" };

  const user = await getSessionUser();
  const name = `${d.address.firstName} ${d.address.lastName}`.trim();

  // Les moyens de paiement viennent de la configuration Stripe du mode (carte, Apple/Google
  // Pay, Link, PayPal… selon le dashboard). Sans configuration, on retombe sur la carte
  // seule (+ PayPal si activé dans les réglages), avec repli propre si PayPal n'est pas prêt.
  const pmc = paymentMethodConfig(mode);
  const base: Stripe.PaymentIntentCreateParams = {
    amount: total,
    currency: "eur",
    description: `Mon Vrai - ${quote.count} livre${quote.count > 1 ? "s" : ""}`,
    receipt_email: undefined,
    shipping: {
      name,
      phone: d.address.phone || undefined,
      address: { line1: d.address.line1, line2: d.address.line2 || undefined, postal_code: d.address.postalCode, city: d.address.city, country: d.address.country },
    },
    metadata: {
      source: "monvrai-checkout",
      cartId: quote.cartId,
      customerUid: user?.uid ?? "",
      email: d.email,
      shippingUpdates: d.shippingUpdates ? "1" : "0",
      billingSame: d.billingSame ? "1" : "0",
      // Adresse de facturation saisie : notre source de vérité pour la facture (Tiime).
      billing: d.billingSame || !d.billing ? "" : JSON.stringify({ firstName: d.billing.firstName, lastName: d.billing.lastName, line1: d.billing.line1, line2: d.billing.line2, postalCode: d.billing.postalCode, city: d.billing.city, country: d.billing.country }),
      rateId: shipping.id,
      rateName: shipping.name,
      offerCode: shipping.offerCode,
      relay: shipping.relay && d.relay ? JSON.stringify(d.relay) : "",
      subtotal: String(quote.subtotal),
      shipping: String(shipping.price),
      discount: String(quote.discount),
      promoCodes: JSON.stringify(quote.applied.map((a) => a.code)),
      attribution: quote.attribution ? JSON.stringify(quote.attribution) : "",
      // Lignes figées : slug, quantité, prix unitaire au moment du paiement, g = offert.
      cart: JSON.stringify(quote.lines.map((l) => ({ s: l.slug, q: l.qty, p: l.unitPrice, ...(l.gift ? { g: 1 } : {}) }))),
    },
  };
  let intent;
  try {
    intent = pmc
      ? await stripe.paymentIntents.create({ ...base, payment_method_configuration: pmc, automatic_payment_methods: { enabled: true, allow_redirects: "always" } })
      : await stripe.paymentIntents.create({ ...base, payment_method_types: settings.payments.paypal ? ["card", "paypal"] : ["card"] });
  } catch (e) {
    const err = e as Stripe.errors.StripeError;
    if (!pmc && settings.payments.paypal && err.param === "payment_method_types[1]") {
      // PayPal pas encore activé sur le compte Stripe : on n'y renonce que pour cette commande.
      intent = await stripe.paymentIntents.create({ ...base, payment_method_types: ["card"] });
    } else {
      return { ok: false, error: `Stripe : ${err.message}` };
    }
  }

  if (!intent.client_secret) return { ok: false, error: "Stripe n'a pas renvoyé de secret de paiement." };
  return { ok: true, clientSecret: intent.client_secret, amount: total, intentId: intent.id };
}

export type FreeOrderResult = { ok: true; orderId: string } | { ok: false; error: string; field?: string };

/*
 * Commande à 0 € (ex. code −100 % + livraison offerte) : pas de paiement Stripe. On
 * recalcule le devis côté serveur, on vérifie que le total est réellement nul, puis on
 * crée la commande directement et on la finalise (facture, e-mail) comme une commande
 * payée. Idempotent sur le panier pour éviter un double clic.
 */
export async function placeFreeOrderAction(raw: CheckoutInput): Promise<FreeOrderResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Formulaire incomplet", field: issue?.path.join(".") };
  }
  const d = parsed.data;

  const settings = await getSettings();
  const mode = settings.payments.mode;
  if (!settings.shipping.countries.includes(d.address.country)) return { ok: false, error: "Nous ne livrons pas encore ce pays.", field: "address.country" };

  const { quote } = await buildQuote(mode, d.email);
  if (!quote.cartId || quote.lines.length === 0) return { ok: false, error: "Votre panier est vide." };
  const { shipping, total } = quoteTotal(quote, d.rateId);
  if (total !== 0) return { ok: false, error: "Cette commande n'est pas gratuite : réglez le paiement." };
  if (shipping.relay && !d.relay) return { ok: false, error: "Choisissez votre point relais sur la carte.", field: "relay" };

  const user = await getSessionUser();
  const products = await getProductsBySlugs(quote.lines.map((l) => l.slug));
  const lines: OrderLine[] = quote.lines.map((l) => {
    const p = products.get(l.slug);
    return { productSlug: l.slug, title: p?.title ?? l.title, qty: l.qty, unitPrice: l.unitPrice, image: p?.images[0], preorder: p?.preorder.enabled ?? l.preorder, gift: l.gift };
  });

  const shippingAddress: Address = {
    name: `${d.address.firstName} ${d.address.lastName}`.trim(),
    line1: d.address.line1,
    line2: d.address.line2 || undefined,
    postalCode: d.address.postalCode,
    city: d.address.city,
    country: d.address.country,
    phone: d.address.phone || undefined,
  };
  const billingAddress: Address | undefined =
    !d.billingSame && d.billing
      ? { name: `${d.billing.firstName} ${d.billing.lastName}`.trim(), line1: d.billing.line1, line2: d.billing.line2 || undefined, postalCode: d.billing.postalCode, city: d.billing.city, country: d.billing.country, phone: shippingAddress.phone }
      : undefined;

  const input: PaidOrderInput = {
    lines,
    totals: { subtotal: quote.subtotal, shipping: shipping.price, discount: quote.discount, tax: 0, total, currency: "eur" },
    email: d.email,
    customerUid: user?.uid,
    shippingAddress,
    billingAddress,
    delivery: { rateId: shipping.id, rateName: shipping.name, offerCode: shipping.offerCode, relay: shipping.relay && d.relay ? { code: d.relay.code, name: d.relay.name, street: d.relay.street ?? "", postalCode: d.relay.postalCode ?? "", city: d.relay.city ?? "", network: d.relay.network ?? "" } : undefined },
    promoCodes: quote.applied.map((a) => a.code),
    attribution: quote.attribution ?? undefined,
    // Pas de Stripe : clé d'idempotence dérivée du panier (anti double-clic).
    stripe: { paymentIntentId: `free_${quote.cartId}` },
  };

  const order = await createPaidOrder({ ...input, livemode: mode === "live" });
  await fulfillOrder(order, quote.cartId, input, "site");
  return { ok: true, orderId: order.id };
}
