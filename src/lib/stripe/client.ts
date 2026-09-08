import "server-only";
import Stripe from "stripe";

/*
 * Client Stripe côté serveur, en deux exemplaires : les clés « live » encaissent, les
 * clés « test » simulent. Le mode courant est un réglage de la boutique (Réglages →
 * Paiements) ; il se lit via getPaymentMode() dans stripe/mode.ts, jamais ici, pour
 * que ce module reste sans dépendance à la base.
 *
 * Sans clé pour le mode demandé, on renvoie null plutôt que de planter : le site
 * fonctionne (catalogue, panier, admin) et seul le paiement est indisponible, avec
 * un message clair.
 */

export type PaymentMode = "live" | "test";

const instances = new Map<PaymentMode, Stripe | null>();

export function secretKey(mode: PaymentMode): string | undefined {
  return mode === "test" ? process.env.STRIPE_SECRET_KEY_TEST : process.env.STRIPE_SECRET_KEY;
}

export function webhookSecret(mode: PaymentMode): string | undefined {
  return mode === "test" ? process.env.STRIPE_WEBHOOK_SECRET_TEST : process.env.STRIPE_WEBHOOK_SECRET;
}

export function getStripe(mode: PaymentMode = "live"): Stripe | null {
  if (!instances.has(mode)) {
    const key = secretKey(mode);
    instances.set(mode, key ? new Stripe(key, { typescript: true }) : null);
  }
  return instances.get(mode) ?? null;
}

export function stripeConfigured(mode: PaymentMode = "live"): boolean {
  return Boolean(secretKey(mode));
}

/** Clé publiable du mode, pour Stripe.js dans le navigateur. */
export function publishableKey(mode: PaymentMode = "live"): string | undefined {
  return mode === "test" ? process.env.STRIPE_PUBLISHABLE_KEY_TEST : process.env.STRIPE_PUBLISHABLE_KEY;
}
