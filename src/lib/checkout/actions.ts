"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { loadCart } from "@/lib/cart/read";
import { getSettings } from "@/lib/db/settings";
import { getStripe } from "@/lib/stripe/client";

/*
 * Passage à la caisse. On ne calcule rien ici que Stripe ne recalcule : les lignes
 * partent avec leur prix courant, et c'est la session Stripe qui fait foi jusqu'au
 * webhook. Le panier est identifié dans les métadonnées pour être vidé à la
 * confirmation, pas avant — un paiement abandonné doit retrouver son panier intact.
 */

export type CheckoutResult = { ok: false; error: string };

export async function startCheckout(): Promise<CheckoutResult> {
  const view = await loadCart();
  if (!view.id || view.lines.length === 0) return { ok: false, error: "Votre panier est vide." };

  const [settings, user] = await Promise.all([getSettings(), getSessionUser()]);
  const mode = settings.payments.mode;
  const stripe = getStripe(mode);
  if (!stripe) {
    return { ok: false, error: `Le paiement n'est pas encore activé sur ce site. Les clés Stripe (${mode}) manquent.` };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const freeShipping = view.shipping.enabled && view.shipping.reached;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "fr",
    currency: "eur",
    customer_email: user?.email || undefined,
    client_reference_id: view.id,
    metadata: { cartId: view.id, customerUid: user?.uid ?? "", mode },
    line_items: view.lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: "eur",
        unit_amount: l.product.price,
        product_data: {
          name: l.product.title,
          description: l.product.preorder.enabled ? "Précommande" : undefined,
          images: l.product.images[0] ? [l.product.images[0].url] : undefined,
          metadata: { slug: l.product.slug },
        },
      },
    })),
    shipping_address_collection: { allowed_countries: settings.shipping.countries as ["FR"] },
    // Un seul tarif de port pour l'instant ; Stripe l'affiche et l'encaisse.
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: freeShipping ? "Livraison offerte" : "Livraison",
          fixed_amount: { currency: "eur", amount: freeShipping ? 0 : 490 },
          delivery_estimate: undefined,
        },
      },
    ],
    allow_promotion_codes: true,
    discounts: view.cart.promoCode ? undefined : undefined,
    phone_number_collection: { enabled: true },
    automatic_tax: process.env.STRIPE_TAX === "1" ? { enabled: true } : undefined,
    success_url: `${site}/commande/merci?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/panier`,
  });

  if (!session.url) return { ok: false, error: "Stripe n'a pas renvoyé de page de paiement." };
  redirect(session.url);
}
