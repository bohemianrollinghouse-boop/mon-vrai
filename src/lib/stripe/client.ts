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

/*
 * PayPal n'apparaît à la caisse que s'il est réellement actif sur le compte Stripe.
 * On lit la capacité du compte, mise en cache quelques minutes pour ne pas interroger
 * Stripe à chaque page de paiement.
 */
const paypalCache = new Map<PaymentMode, { active: boolean; at: number }>();

export async function paypalAvailable(mode: PaymentMode): Promise<boolean> {
  const cached = paypalCache.get(mode);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.active;
  const stripe = getStripe(mode);
  if (!stripe) return false;
  try {
    const account = await stripe.accounts.retrieveCurrent();
    // paypal_payments n'est pas dans les types Stripe (en retard sur l'API) : lecture souple.
    const caps = account.capabilities as Record<string, string> | undefined;
    const active = caps?.paypal_payments === "active";
    paypalCache.set(mode, { active, at: Date.now() });
    return active;
  } catch (err) {
    console.warn("[stripe] capacité PayPal non lue :", err);
    return false;
  }
}
