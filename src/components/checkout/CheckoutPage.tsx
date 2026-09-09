"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance, type StripeExpressCheckoutElementConfirmEvent, type StripeExpressCheckoutElementShippingAddressChangeEvent, type StripeExpressCheckoutElementShippingRateChangeEvent } from "@stripe/stripe-js";
import { PromoForm } from "@/components/site/CartLineControls";
import { RelayPicker, type Relay } from "@/components/checkout/RelayPicker";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { TINT_BG } from "@/components/site/ui";
import { createPaymentIntentAction, type CheckoutInput } from "@/lib/checkout/actions";
import type { Quote } from "@/lib/checkout/quote";
import { formatEuro } from "@/lib/domain/money";

/*
 * Page de paiement (maquette 8a) : paiement express, puis 1 Contact, 2 Livraison,
 * 3 Paiement, et le récapitulatif collant à droite. Stripe.js en « intent différé » :
 * les éléments connaissent le montant, le PaymentIntent n'est créé qu'au clic sur
 * « Payer », côté serveur, avec le devis recalculé.
 */

type Prefill = { email: string; firstName: string; lastName: string; line1: string; line2: string; postalCode: string; city: string; country: string; phone: string };

type Props = {
  publishableKey: string | null;
  pmcId: string | null;
  paypal: boolean;
  mapToken: string | null;
  testMode: boolean;
  quote: Quote;
  siteUrl: string;
  user: { email: string; name: string } | null;
  prefill: Prefill;
  preorderShipFrom: string | null;
  contactEmail: string | null;
  vatNote: string;
  shopName: string;
};

const APPEARANCE: Appearance = {
  theme: "flat",
  variables: {
    colorPrimary: "#111111",
    colorBackground: "#fbf8f3",
    colorText: "#111111",
    colorTextSecondary: "#666666",
    colorTextPlaceholder: "#999999",
    colorDanger: "#8a1f1f",
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "14px",
    borderRadius: "14px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { padding: "16px 18px", fontWeight: "600", border: "1.5px solid transparent", boxShadow: "none" },
    ".Input:focus": { border: "1.5px solid #111111", boxShadow: "none" },
    ".Label": { fontWeight: "700", fontSize: "13px", marginBottom: "8px" },
    // Moyens de paiement en liste verticale sobre (voir layout « accordion » plus bas).
    ".AccordionItem": { border: "1.5px solid #e8e2d8", borderRadius: "12px", backgroundColor: "#ffffff", boxShadow: "none", padding: "18px 18px" },
    ".AccordionItem:hover": { borderColor: "#111111" },
    ".AccordionItem--selected": { border: "1.5px solid #111111", backgroundColor: "#ffffff", boxShadow: "none" },
    ".Block": { borderRadius: "16px", backgroundColor: "#fbf8f3", boxShadow: "none" },
  },
};

const field = "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-[1.5px] focus-visible:outline-offset-0 focus-visible:outline-ink";
const labelCls = "flex flex-col gap-2 text-[0.8125rem] font-bold";

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function CheckoutPage(props: Props) {
  const { publishableKey, quote } = props;
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  const [rateId, setRateId] = useState(quote.shippingOptions[0]?.id ?? "");
  const [step, setStep] = useState<"livraison" | "paiement">("livraison");
  const shipping = quote.shippingOptions.find((o) => o.id === rateId) ?? quote.shippingOptions[0];
  const total = Math.max(0, quote.subtotal - quote.discount) + (shipping?.price ?? 0);

  return (
    <div className="min-h-screen bg-paper">
      <header className="site-wrap flex flex-wrap items-center justify-between gap-4 py-6">
        <Link href="/" aria-label={props.shopName}>
          <Image src="/logo.svg" alt={props.shopName} width={120} height={30} className="h-[30px] w-auto" style={{ height: 30, width: "auto" }} priority />
        </Link>
        <nav className="flex gap-1.5 rounded-pill bg-white p-1.5 text-[0.8125rem] font-semibold" aria-label="Étapes">
          <Link href="/panier" className="rounded-pill px-[1.125rem] py-2.5 text-subtle hover:text-ink">
            Panier
          </Link>
          <button
            type="button"
            onClick={() => {
              setStep("livraison");
              document.getElementById("etape-livraison")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`rounded-pill px-[1.125rem] py-2.5 transition-colors ${step === "livraison" ? "bg-ink text-white" : "text-subtle hover:text-ink"}`}
            aria-current={step === "livraison" ? "step" : undefined}
          >
            Livraison
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("paiement");
              document.getElementById("etape-paiement")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`rounded-pill px-[1.125rem] py-2.5 transition-colors ${step === "paiement" ? "bg-ink text-white" : "text-subtle hover:text-ink"}`}
            aria-current={step === "paiement" ? "step" : undefined}
          >
            Paiement
          </button>
        </nav>
        <span className="flex items-center gap-2 text-[0.8125rem] font-semibold text-tint-green-ink">
          <span className="h-2 w-2 rounded-pill bg-tint-green-ink" aria-hidden="true" />
          Paiement sécurisé
        </span>
      </header>

      {props.testMode && (
        <div className="site-wrap">
          <p className="rounded-[14px] bg-tint-sand px-5 py-3 text-center text-xs font-bold text-tint-sand-ink">Mode test — aucun débit réel. Carte de test : 4242 4242 4242 4242, date future, CVC 123.</p>
        </div>
      )}

      <div className="site-wrap grid grid-cols-[1.5fr_1fr] items-start gap-5 pb-[4.5rem] pt-4 max-[1099px]:grid-cols-1">
        {stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              mode: "payment",
              amount: total,
              currency: "eur",
              // La configuration Stripe pilote les moyens ; à défaut, carte (+ PayPal si activé).
              ...(props.pmcId ? { paymentMethodConfiguration: props.pmcId } : { paymentMethodTypes: props.paypal ? ["card", "paypal"] : ["card"] }),
              appearance: APPEARANCE,
              fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" }],
            }}
          >
            <CheckoutForm {...props} rateId={rateId} setRateId={setRateId} total={total} onStep={setStep} />
          </Elements>
        ) : (
          <div className="rounded-card bg-white p-7 text-sm text-muted">Le paiement n'est pas encore activé sur ce site (clé publiable Stripe manquante). Écrivez-nous : {props.contactEmail}.</div>
        )}

        <Summary quote={quote} shipping={shipping} total={total} preorderShipFrom={props.preorderShipFrom} contactEmail={props.contactEmail} vatNote={props.vatNote} />
      </div>

      <footer className="site-wrap flex flex-wrap justify-between gap-4 border-t border-line-warm py-5 text-xs text-subtle">
        <span>© {new Date().getFullYear()} {props.shopName}</span>
        <div className="flex flex-wrap gap-4 font-semibold">
          <Link href="/informations/refund-policy">Politique de remboursement</Link>
          <Link href="/informations/shipping-policy">Expédition</Link>
          <Link href="/informations/privacy-policy">Confidentialité</Link>
          <Link href="/informations/terms-of-sale">CGV</Link>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Formulaire (dans <Elements>) ---------- */

type FormProps = Props & { rateId: string; setRateId: (id: string) => void; total: number; onStep: (s: "livraison" | "paiement") => void };

function CheckoutForm({ quote, prefill, user, siteUrl, rateId, setRateId, total, onStep, mapToken }: FormProps) {
  const selectedOption = quote.shippingOptions.find((o) => o.id === rateId);
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [form, setForm] = useState<Prefill>(prefill);
  const [shippingUpdates, setShippingUpdates] = useState(true);
  const [billingSame, setBillingSame] = useState(true);
  const [billingAddr, setBillingAddr] = useState<Prefill>(prefill);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  // Masqué tant que Stripe n'a pas confirmé qu'un portefeuille (Apple/Google Pay…) est disponible.
  const [hasExpress, setHasExpress] = useState(false);
  const paymentRef = useRef<HTMLDivElement>(null);

  // Le montant des éléments suit le devis (mode de livraison, remise).
  useEffect(() => {
    elements?.update({ amount: total });
  }, [elements, total]);

  const set = (k: keyof Prefill) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const input = (): CheckoutInput => ({
    email: form.email,
    shippingUpdates,
    rateId,
    billingSame,
    address: { firstName: form.firstName, lastName: form.lastName, line1: form.line1, line2: form.line2, postalCode: form.postalCode, city: form.city, country: form.country, phone: form.phone },
    relay: selectedOption?.relay ? relay : null,
  });

  const returnUrl = `${siteUrl}/commande/merci`;

  async function confirm(clientSecret: string, intentId: string, expressEvent?: StripeExpressCheckoutElementConfirmEvent) {
    if (!stripe || !elements) return;
    // Le paiement express (portefeuille) fournit lui-même la facturation ; sinon on la
    // fournit intégralement, depuis la livraison ou l'adresse de facturation distincte.
    // Stripe exige chaque champ d'adresse dès qu'on lui dit de ne pas le collecter (state/line2 vides possibles).
    const src = billingSame ? form : billingAddr;
    const billing = expressEvent
      ? undefined
      : {
          name: `${src.firstName} ${src.lastName}`.trim(),
          email: form.email,
          phone: (billingSame ? form.phone : billingAddr.phone) || form.phone || undefined,
          address: { line1: src.line1, line2: src.line2 || "", postal_code: src.postalCode, city: src.city, state: "", country: src.country },
        };
    const result = await stripe.confirmPayment({
      elements,
      clientSecret,
      redirect: "if_required",
      confirmParams: {
        return_url: returnUrl,
        receipt_email: form.email || expressEvent?.billingDetails?.email,
        payment_method_data: billing ? { billing_details: billing } : undefined,
      },
    });
    if (result.error) {
      setError(result.error.message ?? "Le paiement a été refusé.");
      expressEvent?.paymentFailed({ reason: "fail" });
      return;
    }
    router.push(`/commande/merci?payment_intent=${encodeURIComponent(intentId)}`);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    if (selectedOption?.relay && !relay) {
      setError("Choisissez votre point relais sur la carte avant de payer.");
      return;
    }
    setPending(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Vérifiez les informations de paiement.");
        return;
      }
      const res = await createPaymentIntentAction(input());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await confirm(res.clientSecret, res.intentId);
    } catch (err) {
      setError((err as Error).message || "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  // Paiement express : Apple Pay / Google Pay / PayPal collectent adresse et livraison eux-mêmes.
  // Apple/Google Pay ne savent pas choisir un point relais : seules les livraisons à domicile.
  const expressRates = quote.shippingOptions.filter((o) => !o.relay).map((o) => ({ id: o.id, displayName: o.name, amount: o.price, deliveryEstimate: o.description || undefined }));

  function onExpressShippingAddress(e: StripeExpressCheckoutElementShippingAddressChangeEvent) {
    if (!quote.countries.includes(e.address.country)) return e.reject();
    e.resolve({ shippingRates: expressRates });
  }
  function onExpressShippingRate(e: StripeExpressCheckoutElementShippingRateChangeEvent) {
    const option = quote.shippingOptions.find((o) => o.id === e.shippingRate.id);
    if (!option) return e.reject();
    setRateId(option.id);
    e.resolve();
  }
  async function onExpressConfirm(e: StripeExpressCheckoutElementConfirmEvent) {
    if (!elements) return;
    setError(null);
    const addr = e.shippingAddress;
    const rate = e.shippingRate?.id ?? rateId;
    if (!addr) return e.paymentFailed({ reason: "invalid_shipping_address" });
    const [firstName, ...rest] = (addr.name ?? "").split(" ");
    const { error: submitError } = await elements.submit();
    if (submitError) return e.paymentFailed({ reason: "fail" });
    const res = await createPaymentIntentAction({
      email: e.billingDetails?.email ?? form.email,
      shippingUpdates: true,
      rateId: rate,
      billingSame: false,
      address: { firstName: firstName || "Client", lastName: rest.join(" "), line1: addr.address.line1 ?? "", line2: addr.address.line2 ?? "", postalCode: addr.address.postal_code ?? "", city: addr.address.city ?? "", country: addr.address.country, phone: e.billingDetails?.phone ?? "" },
    });
    if (!res.ok) {
      setError(res.error);
      return e.paymentFailed({ reason: "fail" });
    }
    setRateId(rate);
    await confirm(res.clientSecret, res.intentId, e);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
      <Card hidden={!hasExpress}>
        <CardHead title="Paiement express" aside="Adresse et livraison pré-remplies" />
        <ExpressCheckoutElement
          onReady={(e) => setHasExpress(Object.values(e.availablePaymentMethods ?? {}).some(Boolean))}
          options={{
            buttonHeight: 52,
            buttonTheme: { applePay: "black", googlePay: "black", paypal: "black" },
            layout: { maxColumns: 3, maxRows: 1, overflow: "auto" },
            emailRequired: true,
            phoneNumberRequired: true,
            shippingAddressRequired: true,
            allowedShippingCountries: quote.countries,
            shippingRates: expressRates,
          }}
          onClick={(e) => e.resolve({ emailRequired: true, phoneNumberRequired: true, shippingAddressRequired: true, allowedShippingCountries: quote.countries, shippingRates: expressRates })}
          onShippingAddressChange={onExpressShippingAddress}
          onShippingRateChange={onExpressShippingRate}
          onConfirm={onExpressConfirm}
        />
        <div className="flex items-center gap-3 text-xs font-semibold text-[#bbb]">
          <span className="h-px flex-1 bg-line" />
          ou continuer ci-dessous
          <span className="h-px flex-1 bg-line" />
        </div>
      </Card>

      <Card>
        <CardHead
          n={1}
          title="Contact"
          aside={
            user ? (
              <span className="text-[0.8125rem] font-semibold text-subtle">Connecté · {user.email}</span>
            ) : (
              <Link href="/compte/connexion?retour=%2Fcommande" className="border-b border-[#ccc] text-[0.8125rem] font-semibold text-subtle">
                Déjà client ? Se connecter
              </Link>
            )
          }
        />
        <label className={labelCls}>
          <span>E-mail</span>
          <input type="email" required autoComplete="email" value={form.email} onChange={set("email")} className={field} />
        </label>
        <Check checked={shippingUpdates} onChange={setShippingUpdates} label="Me tenir au courant de l'expédition par e-mail" />
      </Card>

      <Card id="etape-livraison" onFocusCapture={() => onStep("livraison")}>
        <CardHead n={2} title="Livraison" />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pays">
          {quote.countries.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={form.country === c} onClick={() => setForm({ ...form, country: c })} className={`rounded-pill px-4 py-2.5 text-[0.8125rem] ${form.country === c ? "bg-ink font-bold text-white" : "bg-paper font-semibold hover:opacity-70"}`}>
              {countryName(c)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
          <label className={labelCls}>
            <span>Prénom</span>
            <input required autoComplete="given-name" value={form.firstName} onChange={set("firstName")} className={field} />
          </label>
          <label className={labelCls}>
            <span>Nom</span>
            <input required autoComplete="family-name" value={form.lastName} onChange={set("lastName")} className={field} />
          </label>
        </div>
        <AddressAutocomplete
          value={form.line1}
          country={form.country}
          fieldClassName={field}
          labelClassName={labelCls}
          onInput={(v) => setForm((f) => ({ ...f, line1: v }))}
          onPick={(a) => setForm((f) => ({ ...f, line1: a.line1, postalCode: a.postalCode, city: a.city }))}
        />
        <label className={labelCls}>
          <span>
            Complément <span className="font-medium text-faint">(bâtiment, étage…)</span>
          </span>
          <input autoComplete="address-line2" value={form.line2} onChange={set("line2")} className={field} />
        </label>
        <div className="grid grid-cols-[1fr_2fr] gap-4 max-[599px]:grid-cols-1">
          <label className={labelCls}>
            <span>Code postal</span>
            <input required autoComplete="postal-code" value={form.postalCode} onChange={set("postalCode")} className={field} />
          </label>
          <label className={labelCls}>
            <span>Ville</span>
            <input required autoComplete="address-level2" value={form.city} onChange={set("city")} className={field} />
          </label>
        </div>
        <label className={labelCls}>
          <span>
            Téléphone <span className="font-medium text-faint">(pour le transporteur)</span>
          </span>
          <input type="tel" required autoComplete="tel" placeholder="06 …" value={form.phone} onChange={set("phone")} className={field} />
        </label>

        <div className="mt-1.5 flex flex-col gap-2.5" role="radiogroup" aria-label="Mode de livraison">
          <span className="text-[0.8125rem] font-bold">Mode de livraison</span>
          {quote.shippingOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={rateId === o.id}
              onClick={() => {
                setRateId(o.id);
                if (!o.relay || o.networks.join() !== selectedOption?.networks.join()) setRelay(null);
              }}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-2xl border-[1.5px] bg-paper px-[1.125rem] py-4 text-left ${rateId === o.id ? "border-ink" : "border-transparent hover:border-line-warm"}`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-pill border-2 border-ink">
                <span className={`h-2.5 w-2.5 rounded-pill ${rateId === o.id ? "bg-ink" : "bg-transparent"}`} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold">{o.name}</span>
                {o.description && <span className="text-xs text-muted">{o.description}</span>}
              </span>
              <span className="text-sm font-extrabold">{o.price === 0 ? "Offerte" : formatEuro(o.price)}</span>
            </button>
          ))}
          <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-faint">
            <span className="h-1.5 w-1.5 rounded-pill bg-tint-green-ink" aria-hidden="true" />
            Étiquettes et suivi fournis par Boxtal
          </span>
        </div>
        {selectedOption?.relay && (
          <RelayPicker token={mapToken} networks={selectedOption.networks} address={{ country: form.country, postalCode: form.postalCode, city: form.city, street: form.line1 }} selected={relay} onSelect={setRelay} />
        )}
      </Card>

      <Card id="etape-paiement" onFocusCapture={() => onStep("paiement")}>
        <div ref={paymentRef}>
          <CardHead n={3} title="Paiement" aside="Chiffré et sécurisé" />
        </div>
        <PaymentElement
          options={{
            // Liste verticale : logos plus lisibles et rendu plus sobre que les onglets.
            layout: { type: "accordion", defaultCollapsed: false, radios: "always", spacedAccordionItems: true },
            // On collecte nous-mêmes la facturation (identique à la livraison ou saisie ci-dessous).
            fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "never" } },
            // Apple/Google Pay vivent dans le paiement express au-dessus ; Link n'a pas sa place ici.
            wallets: { applePay: "never", googlePay: "never", link: "never" },
            terms: { card: "never" },
          }}
          onReady={() => setPaymentReady(true)}
        />
        <Check checked={billingSame} onChange={setBillingSame} label="Adresse de facturation identique à l'adresse de livraison" />
        {!billingSame && (
          <div className="flex flex-col gap-[1.125rem] border-t border-line pt-[1.125rem]">
            <span className="text-[0.9375rem] font-bold">Adresse de facturation</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pays de facturation">
              {quote.countries.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={billingAddr.country === c} onClick={() => setBillingAddr({ ...billingAddr, country: c })} className={`rounded-pill px-4 py-2.5 text-[0.8125rem] ${billingAddr.country === c ? "bg-ink font-bold text-white" : "bg-paper font-semibold hover:opacity-70"}`}>
                  {countryName(c)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
              <label className={labelCls}>
                <span>Prénom</span>
                <input required autoComplete="off" value={billingAddr.firstName} onChange={(e) => setBillingAddr({ ...billingAddr, firstName: e.target.value })} className={field} />
              </label>
              <label className={labelCls}>
                <span>Nom</span>
                <input required autoComplete="off" value={billingAddr.lastName} onChange={(e) => setBillingAddr({ ...billingAddr, lastName: e.target.value })} className={field} />
              </label>
            </div>
            <AddressAutocomplete
              value={billingAddr.line1}
              country={billingAddr.country}
              fieldClassName={field}
              labelClassName={labelCls}
              onInput={(v) => setBillingAddr((b) => ({ ...b, line1: v }))}
              onPick={(a) => setBillingAddr((b) => ({ ...b, line1: a.line1, postalCode: a.postalCode, city: a.city }))}
            />
            <label className={labelCls}>
              <span>
                Complément <span className="font-medium text-faint">(bâtiment, étage…)</span>
              </span>
              <input autoComplete="off" value={billingAddr.line2} onChange={(e) => setBillingAddr({ ...billingAddr, line2: e.target.value })} className={field} />
            </label>
            <div className="grid grid-cols-[1fr_2fr] gap-4 max-[599px]:grid-cols-1">
              <label className={labelCls}>
                <span>Code postal</span>
                <input required autoComplete="off" value={billingAddr.postalCode} onChange={(e) => setBillingAddr({ ...billingAddr, postalCode: e.target.value })} className={field} />
              </label>
              <label className={labelCls}>
                <span>Ville</span>
                <input required autoComplete="off" value={billingAddr.city} onChange={(e) => setBillingAddr({ ...billingAddr, city: e.target.value })} className={field} />
              </label>
            </div>
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-5 py-3.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-5 px-1 py-2">
        <Link href="/panier" className="border-b border-[#ccc] text-[0.8125rem] font-semibold text-subtle">
          ← Retour au panier
        </Link>
        <button type="submit" disabled={pending || !stripe || !paymentReady} className="rounded-pill bg-ink px-9 py-5 text-[0.9375rem] font-bold text-white disabled:opacity-60">
          {pending ? "Paiement en cours…" : `Payer ${formatEuro(total)}`}
        </button>
      </div>
      <p className="px-1 text-right text-xs leading-relaxed text-subtle">
        En validant, vous acceptez nos <Link href="/informations/terms-of-sale" className="underline">conditions générales de vente</Link> et notre <Link href="/informations/privacy-policy" className="underline">politique de confidentialité</Link>.
        {quote.lines.some((l) => l.preorder) && " Précommande : débit immédiat, expédition à la date annoncée."}
      </p>
    </form>
  );
}

/* ---------- Récapitulatif ---------- */

function Summary({ quote, shipping, total, preorderShipFrom, contactEmail, vatNote }: { quote: Quote; shipping?: Quote["shippingOptions"][number]; total: number; preorderShipFrom: string | null; contactEmail: string | null; vatNote: string }) {
  const hasPreorder = quote.lines.some((l) => l.preorder);
  const shipFrom = preorderShipFrom ? new Date(preorderShipFrom).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <aside className="sticky top-6 flex flex-col gap-3">
      <div className="flex flex-col gap-[1.125rem] rounded-card bg-white p-7">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-extrabold tracking-[-0.01em]">Votre commande</span>
          <Link href="/panier" className="border-b border-[#ccc] text-xs font-semibold text-subtle">
            Modifier
          </Link>
        </div>
        <ul className="flex flex-col gap-3.5">
          {quote.lines.map((l) => (
            <li key={l.slug} className="grid grid-cols-[56px_1fr_auto] items-center gap-3.5">
              <span className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl ${TINT_BG[l.tint]}`}>
                {l.image && <Image src={l.image} alt="" fill sizes="56px" className="object-cover" />}
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-pill bg-ink text-[0.6875rem] font-bold text-white">{l.qty}</span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-bold">{l.title}</span>
                <span className="text-xs text-subtle">
                  {l.gift ? "Offert · " : l.preorder ? "Précommande · " : ""}6–18 mois
                </span>
              </span>
              <span className={`whitespace-nowrap text-sm font-extrabold ${l.gift ? "text-tint-green-ink" : ""}`}>{l.gift ? "Offert" : formatEuro(l.total)}</span>
            </li>
          ))}
        </ul>
        <PromoForm applied={quote.applied.map((a) => ({ code: a.code, label: a.label, viaLink: a.viaLink }))} errors={quote.rejected} />
        <div className="flex flex-col gap-2.5 border-t border-line pt-4 text-sm font-semibold">
          <div className="flex justify-between">
            <span className="text-muted">
              Sous-total · {quote.count} livre{quote.count > 1 ? "s" : ""}
            </span>
            <span>{formatEuro(quote.subtotal)}</span>
          </div>
          {quote.applied
            .filter((a) => a.amount > 0)
            .map((a) => (
              <div key={a.code} className="flex justify-between text-tint-green-ink">
                <span>
                  Code {a.code} · {a.label}
                </span>
                <span>−{formatEuro(a.amount)}</span>
              </div>
            ))}
          <div className="flex justify-between gap-3">
            <span className="text-muted">Livraison · {shipping?.name ?? "—"}</span>
            <span className={quote.freeShipping ? "text-tint-green-ink" : ""}>{shipping ? (shipping.price === 0 ? "Offerte" : formatEuro(shipping.price)) : "—"}</span>
          </div>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[0.9375rem] font-bold">Total</span>
          <span className="flex flex-col items-end">
            <span className="whitespace-nowrap text-[1.75rem] font-extrabold tracking-[-0.02em]">{formatEuro(total)}</span>
            <span className="whitespace-nowrap text-[0.6875rem] font-semibold text-subtle">{vatNote || "TTC"}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-tint-green p-6 text-[0.8125rem] font-semibold text-tint-green-ink">
        <span className="text-sm font-extrabold text-ink">{hasPreorder ? "Ce que vous précommandez" : "Ce que vous commandez"}</span>
        {hasPreorder && shipFrom && <span>Expédition à partir du {shipFrom}, tous les livres dans un seul colis.</span>}
        {!hasPreorder && <span>Expédition sous 2 jours ouvrés, tous les livres dans un seul colis.</span>}
        <span>14 jours pour changer d'avis après réception.</span>
        {contactEmail && <span>Une question ? {contactEmail} — réponse sous 48 h.</span>}
      </div>
    </aside>
  );
}

/* ---------- Petits blocs ---------- */

function Card({ children, onFocusCapture, hidden = false, id }: { children: ReactNode; onFocusCapture?: () => void; hidden?: boolean; id?: string }) {
  return (
    <section id={id} onFocusCapture={onFocusCapture} hidden={hidden} className="flex scroll-mt-24 flex-col gap-[1.125rem] rounded-card bg-white p-7 max-[599px]:p-5">
      {children}
    </section>
  );
}

function CardHead({ n, title, aside }: { n?: number; title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-lg font-extrabold tracking-[-0.01em]">
        {n !== undefined && <span className="mr-2 text-subtle">{n}</span>}
        {title}
      </span>
      {typeof aside === "string" ? <span className="text-xs font-semibold text-subtle">{aside}</span> : aside}
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 text-[0.8125rem] text-[#555]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[0.6875rem] font-bold ${checked ? "bg-ink text-white" : "border-[1.5px] border-[#ccc] bg-white"} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink`}>
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
    </label>
  );
}
