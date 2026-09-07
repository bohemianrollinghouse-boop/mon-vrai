import "server-only";
import Stripe from "stripe";

/*
 * Client Stripe côté serveur. Sans clé, on renvoie null plutôt que de planter : le
 * site fonctionne (catalogue, panier, admin) et seul le paiement est indisponible,
 * avec un message clair. C'est l'état normal du projet tant que le compte Stripe
 * n'existe pas.
 */

let instance: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (instance !== undefined) return instance;
  const key = process.env.STRIPE_SECRET_KEY;
  instance = key ? new Stripe(key, { typescript: true }) : null;
  return instance;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
