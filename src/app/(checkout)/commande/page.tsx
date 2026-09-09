import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import { getSessionUser } from "@/lib/auth/session";
import { buildQuote } from "@/lib/checkout/quote";
import { getCustomer } from "@/lib/db/customers";
import { getSettings } from "@/lib/db/settings";
import { getMapToken } from "@/lib/boxtal/client";
import { paymentMethodConfig, paypalAvailable, publishableKey } from "@/lib/stripe/client";

export const metadata: Metadata = { title: "Paiement", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * Paiement en une page, trois étapes (maquette 8a) : contact, livraison, paiement, avec
 * le récapitulatif à droite - sans quitter le site. Stripe.js affiche les moyens de
 * paiement (carte, Apple Pay, Google Pay, PayPal selon le compte) dans la page ; la
 * commande est créée par le webhook à la confirmation du paiement.
 */
export default async function CheckoutRoute() {
  const [user, mode] = await Promise.all([getSessionUser(), getSettings().then((s) => s.payments.mode)]);
  const [{ quote, settings }, customer, mapToken] = await Promise.all([buildQuote(mode), user ? getCustomer(user.uid) : null, getMapToken().catch(() => null)]);
  const paypal = settings.payments.paypal && (await paypalAvailable(mode));
  if (quote.lines.length === 0) redirect("/panier");

  const saved = customer?.addresses.at(-1);
  const [firstName, ...rest] = (saved?.name ?? user?.name ?? "").split(" ");

  return (
    <CheckoutPage
      publishableKey={publishableKey(mode) ?? null}
      pmcId={paymentMethodConfig(mode) ?? null}
      paypal={paypal}
      mapToken={mapToken}
      testMode={mode === "test"}
      quote={quote}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}
      user={user ? { email: user.email, name: user.name } : null}
      prefill={{
        email: user?.email ?? "",
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        line1: saved?.line1 ?? "",
        line2: saved?.line2 ?? "",
        postalCode: saved?.postalCode ?? "",
        city: saved?.city ?? "",
        country: saved?.country ?? quote.countries[0] ?? "FR",
        phone: saved?.phone ?? "",
      }}
      preorderShipFrom={settings.shipping.preorderShipFrom ?? null}
      contactEmail={settings.contact.email ?? null}
      vatNote={settings.legal.vatNote}
      shopName={settings.shopName}
    />
  );
}
