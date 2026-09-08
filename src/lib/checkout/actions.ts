"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { getStripe } from "@/lib/stripe/client";
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
  phone: z.string().trim().max(30).default(""),
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

  const intent = await stripe.paymentIntents.create({
    amount: total,
    currency: "eur",
    // Carte (dont Apple Pay / Google Pay) : la page n'affiche que ça, l'intention doit coïncider.
    payment_method_types: ["card"],
    description: `Mon Vrai — ${quote.count} livre${quote.count > 1 ? "s" : ""}`,
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
  });

  if (!intent.client_secret) return { ok: false, error: "Stripe n'a pas renvoyé de secret de paiement." };
  return { ok: true, clientSecret: intent.client_secret, amount: total, intentId: intent.id };
}
