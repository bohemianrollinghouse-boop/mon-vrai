"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RelayPicker, type Relay } from "@/components/checkout/RelayPicker";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { ContractDialog } from "@/components/site/ContractDialog";
import { ContractText } from "@/components/site/ContractText";
import { fillContract } from "@/lib/promos/contract-template";
import { contractValues, type ContractGoods, type Seller } from "@/lib/promos/contract-values";
import type { PartnerResult } from "@/lib/auth/partner-actions";
import type { PartnerSocials, SignerStatus } from "@/lib/domain/types";

/*
 * Commande du kit de bienvenue, et signature du contrat quand il y en a un.
 *
 * Tout est dans le fil de la page, dans l'ordre où on le remplit : l'adresse, puis le
 * contrat — résumé, attestations, identité, signature. Ces champs tenaient auparavant
 * dans la fenêtre du contrat, où il fallait les chercher dans un défilement étroit.
 *
 * La fenêtre ne sert plus qu'à UNE chose : lire le contrat une fois rempli de vos
 * informations, et l'accepter. Une fois accepté, le bouton de commande apparaît.
 */

export type KitShippingOption = { id: string; name: string; description: string; relay: boolean; networks: string[] };

export type ContractOffer = {
  id: string;
  name: string;
  version: string;
  typeLabel: string;
  summary: string;
  body: string;
  variables: Record<string, string>;
};

const field =
  "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-[1.5px] focus-visible:outline-offset-0 focus-visible:outline-ink";
const labelCls = "flex flex-col gap-2 text-[0.8125rem] font-bold";

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/* Les attestations. « childAuthorisation » est un engagement conditionnel, pas une
   attestation : elle n'est pas exigée pour valider. */
const CHECKS = [
  { name: "adult", required: true, text: "Je certifie avoir 18 ans ou plus et avoir la capacité de conclure le présent contrat." },
  { name: "readAll", required: true, text: "Je confirme avoir lu l'intégralité du contrat de collaboration." },
  { name: "acceptedContract", required: true, text: "J'ai lu et j'accepte les conditions du contrat et les obligations qui y sont prévues." },
  { name: "accurate", required: true, text: "Je confirme que les informations que j'ai fournies sont exactes." },
  {
    name: "inKind",
    required: true,
    text: "Je comprends que les produits ci-dessus constituent la contrepartie en nature de cette collaboration, et qu'aucune rémunération financière supplémentaire n'est prévue, sauf accord écrit ultérieur.",
  },
  { name: "childNotRequired", required: true, text: "Je comprends qu'aucun enfant identifiable n'est obligé d'apparaître dans les contenus." },
  {
    name: "childAuthorisation",
    required: false,
    text: "Si je transmets des contenus où un enfant mineur est identifiable, je m'engage à disposer des autorisations des titulaires de l'autorité parentale.",
  },
] as const;

export function KitOrderForm({
  countries,
  options,
  mapToken,
  action,
  contract,
  signAction,
  seller,
  goods,
  socials,
  email,
}: {
  countries: string[];
  options: KitShippingOption[];
  mapToken: string | null;
  action: (fd: FormData) => Promise<PartnerResult>;
  /** Contrat à signer avant de recevoir le kit ; absent : rien à signer. */
  contract?: ContractOffer;
  signAction?: (fd: FormData) => Promise<PartnerResult>;
  seller: Seller;
  goods: ContractGoods;
  socials: PartnerSocials;
  email: string;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(countries[0] ?? "FR");
  const [rateId, setRateId] = useState(options[0]?.id ?? "");
  const [relay, setRelay] = useState<Relay | null>(null);
  /* Rien n'est pré-rempli : le nom du compte est souvent un pseudo, pas une identité. */
  const [form, setForm] = useState({ firstName: "", lastName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });
  const [signer, setSigner] = useState({ companyName: "", siret: "", vatNumber: "", taxCountry: "FR", signerTypedName: "" });
  const [status, setStatus] = useState<SignerStatus>("individual");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [signed, setSigned] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k: keyof typeof signer) => (e: React.ChangeEvent<HTMLInputElement>) => setSigner((f) => ({ ...f, [k]: e.target.value }));
  const option = options.find((o) => o.id === rateId) ?? options[0];
  const professional = status !== "individual";

  const addressOk = form.firstName.trim() && form.lastName.trim() && form.line1.trim() && form.postalCode.trim() && form.city.trim() && form.phone.trim() && (!option?.relay || relay);
  const checksOk = CHECKS.every((c) => !c.required || checks[c.name]);
  const signerOk = signer.signerTypedName.trim() && (!professional || (signer.siret.trim() && signer.companyName.trim()));
  const canRead = Boolean(contract) && Boolean(addressOk) && checksOk && Boolean(signerOk);

  /* Le contrat, rempli de ce qui est saisi : c'est ce texte-là qui sera lu, accepté,
     puis conservé tel quel dans la signature. */
  const filled = useMemo(() => {
    if (!contract) return { summary: "", body: "" };
    const values = contractValues({
      contract: { id: contract.id, version: contract.version, variables: contract.variables },
      seller,
      party: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email,
        address: { name: `${form.firstName} ${form.lastName}`.trim(), line1: form.line1, line2: form.line2 || undefined, postalCode: form.postalCode, city: form.city, country },
        taxCountry: signer.taxCountry,
        status,
        companyName: signer.companyName,
        siret: signer.siret,
        vatNumber: signer.vatNumber,
        socials,
      },
      goods,
    });
    return { summary: fillContract(contract.summary, values), body: fillContract(contract.body, values) };
  }, [contract, seller, form, email, country, signer, status, socials, goods]);

  const payload = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v);
    fd.set("country", country);
    fd.set("rateId", rateId);
    fd.set("relay", option?.relay && relay ? JSON.stringify(relay) : "");
    if (contract) {
      for (const [k, v] of Object.entries(signer)) fd.set(k, v);
      fd.set("signerStatus", status);
      for (const c of CHECKS) if (checks[c.name]) fd.set(c.name, "on");
      if (checks.newsletterOptIn) fd.set("newsletterOptIn", "on");
    }
    return fd;
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const run = contract && signAction ? signAction : action;
      const result = await run(payload());
      // Succès : la page partenaire affiche désormais le suivi à la place du bon de commande.
      if (result.ok) router.push("/partenaire#kit");
      else setError(result.error);
    });

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Où livrer ---------- */}
      <div className="flex flex-col gap-5 rounded-card bg-white p-8 max-[599px]:p-6">
        <span className="text-base font-extrabold">Où vous l&apos;envoyer</span>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pays">
          {countries.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={country === c}
              onClick={() => {
                setCountry(c);
                setRelay(null);
              }}
              className={`rounded-pill px-4 py-2.5 text-[0.8125rem] ${country === c ? "bg-ink font-bold text-white" : "bg-paper font-semibold hover:opacity-70"}`}
            >
              {countryName(c)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
          <label className={labelCls}>
            <span>Prénom</span>
            <input value={form.firstName} onChange={set("firstName")} autoComplete="given-name" className={field} />
          </label>
          <label className={labelCls}>
            <span>Nom</span>
            <input value={form.lastName} onChange={set("lastName")} autoComplete="family-name" className={field} />
          </label>
        </div>

        <AddressAutocomplete
          value={form.line1}
          country={country}
          fieldClassName={field}
          labelClassName={labelCls}
          onInput={(v) => setForm((f) => ({ ...f, line1: v }))}
          onPick={(a) => setForm((f) => ({ ...f, line1: a.line1, postalCode: a.postalCode, city: a.city }))}
        />

        <label className={labelCls}>
          <span>
            Complément <span className="font-medium text-faint">(bâtiment, étage…)</span>
          </span>
          <input value={form.line2} onChange={set("line2")} autoComplete="address-line2" className={field} />
        </label>

        <div className="grid grid-cols-[1fr_2fr] gap-4 max-[599px]:grid-cols-1">
          <label className={labelCls}>
            <span>Code postal</span>
            <input value={form.postalCode} onChange={set("postalCode")} autoComplete="postal-code" className={field} />
          </label>
          <label className={labelCls}>
            <span>Ville</span>
            <input value={form.city} onChange={set("city")} autoComplete="address-level2" className={field} />
          </label>
        </div>

        <label className={labelCls}>
          <span>
            Téléphone <span className="font-medium text-faint">(pour le transporteur)</span>
          </span>
          <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="06 …" className={field} />
        </label>

        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Mode de livraison">
          <span className="text-[0.8125rem] font-bold">Mode de livraison</span>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={rateId === o.id}
              onClick={() => {
                setRateId(o.id);
                if (!o.relay || o.networks.join() !== option?.networks.join()) setRelay(null);
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
              <span className="text-sm font-extrabold">Offerte</span>
            </button>
          ))}
        </div>

        {option?.relay && (
          <RelayPicker token={mapToken} networks={option.networks} address={{ country, postalCode: form.postalCode, city: form.city, street: form.line1 }} selected={relay} onSelect={setRelay} />
        )}
      </div>

      {/* ---------- Le contrat ---------- */}
      {contract && (
        <div className="flex flex-col gap-5 rounded-card bg-white p-8 max-[599px]:p-6">
          <div className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Contrat · {contract.typeLabel}</span>
            <span className="text-base font-extrabold">{contract.name}</span>
            <span className="text-xs text-subtle">Version {contract.version}</span>
          </div>

          {contract.summary.trim() && (
            <div className="rounded-card bg-tint-green p-5">
              <ContractSummary text={filled.summary} />
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <span className="text-[0.8125rem] font-bold">Vos attestations</span>
            {CHECKS.map((c) => (
              <label key={c.name} className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-relaxed">
                <input
                  type="checkbox"
                  checked={Boolean(checks[c.name])}
                  onChange={(e) => {
                    setChecks((p) => ({ ...p, [c.name]: e.target.checked }));
                    setSigned(false);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                />
                <span>
                  {c.text}
                  {!c.required && <span className="text-subtle"> (le cas échéant)</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[0.8125rem] font-bold">Vous agissez en tant que</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["individual", "Particulier"],
                  ["sole_trader", "Micro-entrepreneur"],
                  ["company", "Société"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStatus(value);
                    setSigned(false);
                  }}
                  aria-pressed={status === value}
                  className={`rounded-pill px-4 py-2.5 text-[0.8125rem] ${status === value ? "bg-ink font-bold text-white" : "bg-paper font-semibold hover:opacity-70"}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {professional && (
            <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
              <label className={labelCls}>
                <span>Nom commercial ou raison sociale</span>
                <input value={signer.companyName} onChange={setS("companyName")} className={field} />
              </label>
              <label className={labelCls}>
                <span>SIRET</span>
                <input value={signer.siret} onChange={setS("siret")} inputMode="numeric" placeholder="123 456 789 00012" className={field} />
              </label>
              <label className={labelCls}>
                <span>
                  TVA intracommunautaire <span className="font-medium text-faint">(si applicable)</span>
                </span>
                <input value={signer.vatNumber} onChange={setS("vatNumber")} placeholder="FR12345678901" className={field} />
              </label>
            </div>
          )}

          <label className={labelCls}>
            <span>Pays de résidence fiscale</span>
            <input value={signer.taxCountry} onChange={(e) => setSigner((f) => ({ ...f, taxCountry: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="FR" className={`${field} w-28`} />
          </label>

          <label className={labelCls}>
            <span>Signature — saisissez vos prénom et nom</span>
            <input value={signer.signerTypedName} onChange={setS("signerTypedName")} placeholder={`${form.firstName} ${form.lastName}`.trim() || "Prénom Nom"} className={field} />
            <span className="text-xs font-medium leading-relaxed text-subtle">
              En saisissant votre nom puis en validant le contrat, vous confirmez votre acceptation et les engagements qu&apos;il contient.
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-relaxed text-subtle">
            <input type="checkbox" checked={Boolean(checks.newsletterOptIn)} onChange={(e) => setChecks((p) => ({ ...p, newsletterOptIn: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
            <span>Je souhaite recevoir par e-mail les actualités et nouveautés de Mon Vrai. (facultatif, sans effet sur le contrat)</span>
          </label>

          <p className="text-[0.6875rem] leading-relaxed text-subtle">
            Les informations recueillies servent à gérer votre collaboration, établir et conserver le contrat et organiser l&apos;envoi des produits.
            Pour la durée de conservation et vos droits, voyez notre{" "}
            <a href="/privacy-policy" target="_blank" rel="noreferrer" className="underline">
              politique de confidentialité
            </a>
            .
          </p>

          {signed ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tint-green px-5 py-4">
              <span className="text-[0.8125rem] font-bold text-tint-green-ink">Contrat lu et accepté.</span>
              <button type="button" onClick={() => setReading(true)} className="border-b-[1.5px] border-ink text-xs font-bold">
                Le relire
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setReading(true)}
                disabled={!canRead}
                className="w-fit rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Lire et signer le contrat
              </button>
              <span className="text-xs text-subtle">
                {canRead
                  ? "Le contrat s'ouvrira rempli de vos informations."
                  : "Complétez l'adresse, les attestations et votre signature ci-dessus pour ouvrir le contrat."}
              </span>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-card bg-tint-pink px-5 py-4 text-[0.8125rem] font-semibold text-tint-pink-ink">{error}</p>}

      {/* ---------- Commander ---------- */}
      {(!contract || signed) && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={submit} disabled={pending || (!contract && !addressOk)} className="w-fit rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white disabled:opacity-50">
            {pending ? "Envoi…" : "Passer la commande"}
          </button>
          <span className="text-xs text-subtle">Aucun paiement : le kit est offert, frais de port compris.</span>
        </div>
      )}

      {reading && contract && (
        <ContractDialog
          title={contract.name}
          typeLabel={contract.typeLabel}
          version={contract.version}
          body={filled.body}
          signerName={signer.signerTypedName || `${form.firstName} ${form.lastName}`.trim()}
          accepted={signed}
          onClose={() => setReading(false)}
          onAccept={() => {
            setSigned(true);
            setReading(false);
          }}
        />
      )}
    </div>
  );
}

/* Le résumé se rend comme le contrat : l'administration décide de sa mise en forme,
   paragraphes ou puces, sans qu'on la lui impose ici. */
function ContractSummary({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <ContractText text={text} className="[&_h2]:mt-0 [&_h3]:mt-0 !text-tint-green-ink" />
      <span className="text-xs text-tint-green-ink">Ce résumé ne remplace pas le contrat : vous le lirez en entier avant de l&apos;accepter.</span>
    </div>
  );
}
