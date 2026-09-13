"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RelayPicker, type Relay } from "@/components/checkout/RelayPicker";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { ContractDialog } from "@/components/site/ContractDialog";
import { ContractText } from "@/components/site/ContractText";
import { fillContract, renderContract } from "@/lib/promos/contract-template";
import { contractValues, type ContractGoods, type Seller } from "@/lib/promos/contract-values";
import type { PartnerResult } from "@/lib/auth/partner-actions";
import type { PartnerSocials, SignerStatus } from "@/lib/domain/types";

/*
 * Commande du kit de bienvenue, et signature du contrat quand il y en a un.
 *
 * Trois étapes numérotées, dans l'ordre où on les remplit : où livrer, le contrat,
 * attester et signer. Sur un téléphone on les voit une à une, avec une barre de
 * progression et un bouton posé en bas de l'écran ; sur un bureau les trois tiennent
 * dans la page, numérotées, avec un récapitulatif qui suit le défilement. Ce n'est pas
 * deux parcours mais un seul, montré selon la place qu'on a.
 *
 * La fenêtre du contrat ne sert qu'à UNE chose : le lire, rempli de vos informations.
 * On n'atteste pas avoir lu un texte qu'on n'a pas encore vu, d'où l'ordre : informations,
 * lecture, attestations, signature.
 */

export type KitShippingOption = { id: string; name: string; description: string; relay: boolean; networks: string[] };

/** Ce que le partenaire reçoit, tel qu'il s'affiche à côté du formulaire. */
export type KitItem = { slug: string; title: string; qty: number; image?: string };

export type ContractOffer = {
  id: string;
  name: string;
  version: string;
  typeLabel: string;
  summary: string;
  body: string;
  variables: Record<string, string>;
  requiredVariables: string[];
  /* Les dates de la campagne : elles figurent au contrat et ne se saisissent pas. */
  campaign: { startAt: number; endAt?: number };
};

const field =
  "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-[1.5px] focus-visible:outline-offset-0 focus-visible:outline-ink";
const labelCls = "flex flex-col gap-2 text-[0.8125rem] font-bold";
const card = "flex flex-col gap-[1.125rem] rounded-card bg-surface p-8 max-[599px]:p-6";

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

/*
 * Le résumé d'un contrat commence par son titre et un « Résumé » : le panneau porte déjà
 * l'un et l'autre. On retire donc les titres de tête — de l'affichage seulement, la copie
 * figée dans la signature reste le texte entier.
 */
function summaryProse(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith("#"))) i += 1;
  return lines.slice(i).join("\n").trim();
}

const STATUSES: { value: SignerStatus; label: string }[] = [
  { value: "individual", label: "Particulier" },
  { value: "sole_trader", label: "Micro-entrepreneur" },
  { value: "company", label: "Société" },
];

export function KitOrderForm({
  countries,
  options,
  mapToken,
  action,
  contract,
  signAction,
  seller,
  goods,
  items,
  socials,
  email,
  prototype,
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
  items: KitItem[];
  socials: PartnerSocials;
  email: string;
  /** Les livres remis sont-ils des prototypes : le contrat le dit. */
  prototype: boolean;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(countries[0] ?? "FR");
  const [rateId, setRateId] = useState(options[0]?.id ?? "");
  const [relay, setRelay] = useState<Relay | null>(null);
  /* Rien n'est pré-rempli : le nom du compte est souvent un pseudo, pas une identité. */
  const [form, setForm] = useState({ firstName: "", lastName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });
  const [signer, setSigner] = useState({ companyName: "", siret: "", vatNumber: "", taxCountry: "FR", signerTypedName: "" });
  /*
   * Le contractant n'est pas forcément le destinataire : on peut se faire livrer chez
   * sa mère et signer en son propre nom, à sa propre adresse. D'où des coordonnées
   * distinctes, et une case pour reprendre celles de la livraison quand c'est la même
   * personne — ce qui reste le cas courant, sans jamais être supposé.
   */
  const [party, setParty] = useState({ firstName: "", lastName: "", line1: "", line2: "", postalCode: "", city: "", country: countries[0] ?? "FR" });
  const [sameAsDelivery, setSameAsDelivery] = useState(false);
  const [status, setStatus] = useState<SignerStatus>("individual");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  /*
   * On ne coche pas une attestation avant d'avoir lu : `readText` garde le contrat TEL
   * QU'IL A ÉTÉ LU. Si les informations changent ensuite, le contrat change avec elles
   * et la lecture ne vaut plus — il faut le relire. On le dit, on ne le tait pas.
   */
  const [readText, setReadText] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* L'étape affichée sur un petit écran. Sur un bureau, les trois sont toujours là. */
  const [step, setStep] = useState(1);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k: keyof typeof signer) => (e: React.ChangeEvent<HTMLInputElement>) => setSigner((f) => ({ ...f, [k]: e.target.value }));
  const setP = (k: keyof typeof party) => (e: React.ChangeEvent<HTMLInputElement>) => setParty((f) => ({ ...f, [k]: e.target.value }));
  /* Cochée, la case ne copie pas : elle reflète, pour que corriger la livraison suive.
     Mémorisé, sinon le contrat serait recomposé à chaque frappe pour rien. */
  const me = useMemo(
    () =>
      sameAsDelivery
        ? { firstName: form.firstName, lastName: form.lastName, line1: form.line1, line2: form.line2, postalCode: form.postalCode, city: form.city, country }
        : party,
    [sameAsDelivery, form, country, party],
  );
  const option = options.find((o) => o.id === rateId) ?? options[0];
  const professional = status !== "individual";

  /* L'adresse d'abord, le relais ensuite : on ne reproche pas un relais manquant à
     quelqu'un qui n'a pas encore dit où il habite — la carte cherche autour de là. */
  const postalOk = Boolean(form.firstName.trim() && form.lastName.trim() && form.line1.trim() && form.postalCode.trim() && form.city.trim() && form.phone.trim());
  const addressOk = postalOk && Boolean(!option?.relay || relay);
  /* Le contrat ne se lit qu'une fois rempli : ce sont ces informations qui y figurent. */
  const partyOk =
    Boolean(me.firstName.trim() && me.lastName.trim() && me.line1.trim() && me.postalCode.trim() && me.city.trim()) &&
    (!professional || Boolean(signer.siret.trim() && signer.companyName.trim()));
  const checksOk = CHECKS.every((c) => !c.required || checks[c.name]);
  const signedOk = Boolean(signer.signerTypedName.trim());
  const checkedCount = CHECKS.filter((c) => checks[c.name]).length;

  /* Le contrat, rempli de ce qui est saisi : c'est ce texte-là qui sera lu, accepté,
     puis conservé tel quel dans la signature. */
  const filled = useMemo(() => {
    if (!contract) return { summary: "", body: "" };
    const values = contractValues({
      contract: { id: contract.id, version: contract.version, variables: contract.variables },
      campaign: contract.campaign,
      seller,
      party: {
        firstName: me.firstName.trim(),
        lastName: me.lastName.trim(),
        email,
        address: { name: `${me.firstName} ${me.lastName}`.trim(), line1: me.line1, line2: me.line2 || undefined, postalCode: me.postalCode, city: me.city, country: me.country },
        taxCountry: signer.taxCountry,
        status,
        companyName: signer.companyName,
        siret: signer.siret,
        vatNumber: signer.vatNumber,
        socials,
      },
      goods,
      prototype,
    });
    return { summary: fillContract(contract.summary, values), body: renderContract(contract.body, values, contract.requiredVariables) };
  }, [contract, seller, me, email, signer, status, socials, goods, prototype]);

  /* Lu, et lu DANS SA VERSION ACTUELLE : comparer le texte est plus sûr que de suivre
     champ par champ ce qui a bougé. */
  const upToDate = readText !== null && readText === filled.body;
  const stale = readText !== null && readText !== filled.body;

  const payload = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v);
    fd.set("country", country);
    fd.set("rateId", rateId);
    fd.set("relay", option?.relay && relay ? JSON.stringify(relay) : "");
    if (contract) {
      for (const [k, v] of Object.entries(signer)) fd.set(k, v);
      /* Le contrat se conclut au nom du contractant : ses coordonnées à lui. */
      fd.set("firstName", me.firstName);
      fd.set("lastName", me.lastName);
      fd.set("partyLine1", me.line1);
      fd.set("partyLine2", me.line2);
      fd.set("partyPostalCode", me.postalCode);
      fd.set("partyCity", me.city);
      fd.set("partyCountry", me.country);
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

  /*
   * Ce qui manque pour avancer, dit à sa place. Un bouton grisé sans explication est une
   * porte fermée sans écriteau.
   */
  const totalSteps = contract ? 3 : 1;
  const ready = addressOk && (!contract || (partyOk && upToDate && checksOk && signedOk));
  const canLeaveStep = step === 1 ? addressOk : step === 2 ? partyOk && upToDate : checksOk && signedOk;
  const stepHint =
    step === 1
      ? addressOk
        ? "Aucun paiement : le kit est offert, port compris."
        : !postalOk
          ? "Complétez vos coordonnées de livraison."
          : option?.relay && !relay
            ? "Choisissez votre point relais sur la carte."
            : "Complétez vos coordonnées de livraison."
      : step === 2
        ? !partyOk
          ? "Complétez vos coordonnées de contractant."
          : stale
            ? "Vos informations ont changé : relisez le contrat."
            : !upToDate
              ? "Lisez le contrat pour continuer."
              : "Contrat lu. Il reste à attester et signer."
        : !checksOk
          ? "Cochez les attestations obligatoires."
          : !signedOk
            ? "Saisissez vos prénom et nom pour signer."
            : "Aucun paiement : le kit est offert, port compris.";

  /* Le titre d'étape, et l'intitulé du bouton qui y mène. */
  const stepName = ["Où vous l'envoyer", "Le contrat", "Attester et signer"];
  const ctaLabel = !contract ? "Commander mon kit" : step === 1 ? "Continuer · le contrat" : step === 2 ? "Continuer · accepter" : "Accepter le contrat et commander";

  const onCta = () => {
    if (!contract || step === totalSteps) return submit();
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = (to: number) => {
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Une étape passée reste rendue : ses champs font partie du même formulaire. Sur un
     petit écran on la cache, sur un bureau elle reste sous les yeux. */
  const only = (n: number) => (step === n ? "" : "max-[1099px]:hidden");

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Progression, sur petit écran ---------- */}
      {contract && (
        <div className="flex flex-col gap-2 min-[1100px]:hidden">
          {step > 1 && (
            <button type="button" onClick={() => back(step - 1)} className="w-fit text-xs font-bold text-muted hover:opacity-70">
              ← {stepName[step - 2]}
            </button>
          )}
          <div className="grid grid-cols-3 gap-1">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1 rounded-pill ${n <= step ? "bg-ink" : "bg-line-warm"}`} />
            ))}
          </div>
          <span className="text-xs font-bold">
            <span className="text-subtle">Étape {step} sur 3 · </span>
            {stepName[step - 1]}
          </span>
        </div>
      )}

      {/* ---------- Le kit, en bandeau, sur petit écran ---------- */}
      <div className="flex items-center gap-3 rounded-card bg-tint-green px-4 py-3.5 min-[1100px]:hidden">
        <span className="flex shrink-0">
          {items.slice(0, 3).map((item, i) =>
            item.image ? (
              <Image
                key={item.slug}
                src={item.image}
                alt=""
                width={44}
                height={44}
                className={`h-11 w-11 rounded-[12px] bg-white object-cover ${i > 0 ? "-ml-2.5 outline-2 outline-tint-green" : ""}`}
              />
            ) : (
              <span key={item.slug} className={`h-11 w-11 rounded-[12px] bg-white ${i > 0 ? "-ml-2.5 outline-2 outline-tint-green" : ""}`} />
            ),
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[0.8125rem] font-extrabold">
            {goods.reduce((n, g) => n + g.qty, 0)} imagier{goods.reduce((n, g) => n + g.qty, 0) > 1 ? "s" : ""} · offert, livraison comprise
          </span>
          <span className="truncate text-[0.6875rem] font-semibold text-tint-green-ink">{items.map((i) => i.title).join(", ")}</span>
        </span>
      </div>

      <div className="grid items-start gap-6 min-[1100px]:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 1 · Où livrer ---------- */}
          <Step n={1} title="Où vous l'envoyer" className={only(1)} numbered={Boolean(contract)}>
            <p className="text-[0.8125rem] leading-relaxed text-subtle">
              Votre kit vous attendra dans un point relais : rien à guetter chez vous. Votre adresse sert à proposer les
              relais les plus proches.
            </p>

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

            <div className="grid grid-cols-[1fr_2fr_1.4fr] gap-4 max-[749px]:grid-cols-[1fr_2fr] max-[449px]:grid-cols-1">
              <label className={labelCls}>
                <span>Code postal</span>
                <input value={form.postalCode} onChange={set("postalCode")} autoComplete="postal-code" className={field} />
              </label>
              <label className={labelCls}>
                <span>Ville</span>
                <input value={form.city} onChange={set("city")} autoComplete="address-level2" className={field} />
              </label>
              <label className={`${labelCls} max-[749px]:col-span-2 max-[449px]:col-span-1`}>
                <span>
                  Téléphone <span className="font-medium text-faint">(pour le transporteur)</span>
                </span>
                <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="06 …" className={field} />
              </label>
            </div>

            <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Mode de livraison">
              <span className="text-[0.8125rem] font-bold">Mode de livraison</span>
              <div className={`grid gap-2.5 ${options.length > 1 ? "grid-cols-2 max-[749px]:grid-cols-1" : "grid-cols-1"}`}>
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
                    className={`grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-2xl border-[1.5px] bg-paper px-[1.125rem] py-3.5 text-left ${rateId === o.id ? "border-ink" : "border-transparent hover:border-line-warm"}`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-pill border-2 border-ink">
                      <span className={`h-2.5 w-2.5 rounded-pill ${rateId === o.id ? "bg-ink" : "bg-transparent"}`} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-bold">{o.name}</span>
                      {o.description && <span className="truncate text-xs text-muted">{o.description}</span>}
                    </span>
                    <span className="text-sm font-extrabold">Offerte</span>
                  </button>
                ))}
              </div>
            </div>

            {option?.relay && (
              <RelayPicker
                token={mapToken}
                networks={option.networks}
                address={{ country, postalCode: form.postalCode, city: form.city, street: form.line1 }}
                selected={relay}
                onSelect={setRelay}
              />
            )}
          </Step>

          {/* ---------- 2 · Le contrat ---------- */}
          {contract && (
            <Step n={2} title="Le contrat" className={only(2)} numbered aside={`${contract.typeLabel} · ${contract.name} · version ${contract.version}`}>
              <div className="grid grid-cols-2 items-start gap-5 max-[899px]:grid-cols-1">
                {summaryProse(filled.summary) && (
                  <div className="flex flex-col gap-2 rounded-card bg-tint-green p-5 text-tint-green-ink">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em]">En résumé</span>
                    <ContractText text={summaryProse(filled.summary)} className="!text-tint-green-ink" />
                    <span className="text-[0.6875rem]">Ce résumé ne remplace pas le contrat : vous le lirez en entier avant de l&apos;accepter.</span>
                  </div>
                )}

                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.8125rem] font-extrabold">Vos coordonnées de contractant</span>
                    <span className="text-xs leading-relaxed text-subtle">Celles qui figureront au contrat ; elles peuvent différer de la livraison.</span>
                  </div>

                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={sameAsDelivery}
                    onClick={() => setSameAsDelivery(!sameAsDelivery)}
                    className="flex items-center gap-3 rounded-[14px] bg-paper px-3.5 py-3 text-left text-[0.8125rem] font-semibold"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink text-xs font-extrabold ${sameAsDelivery ? "bg-ink text-white" : ""}`}>
                      {sameAsDelivery ? "✓" : ""}
                    </span>
                    Réutiliser mes informations de livraison
                  </button>

                  {sameAsDelivery ? (
                    <div className="flex flex-col gap-1 px-1 text-[0.8125rem] leading-relaxed text-muted">
                      <span className="font-bold text-ink">{`${me.firstName} ${me.lastName}`.trim() || "Vos nom et prénom"}</span>
                      <span>{[me.line1, me.line2, `${me.postalCode} ${me.city}`.trim(), countryName(me.country)].filter(Boolean).join(", ") || "Votre adresse de livraison"}</span>
                      <span>{email}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
                        <label className={labelCls}>
                          <span>Prénom</span>
                          <input value={party.firstName} onChange={setP("firstName")} className={field} />
                        </label>
                        <label className={labelCls}>
                          <span>Nom</span>
                          <input value={party.lastName} onChange={setP("lastName")} className={field} />
                        </label>
                      </div>
                      <label className={labelCls}>
                        <span>Adresse</span>
                        <input value={party.line1} onChange={setP("line1")} className={field} />
                      </label>
                      <label className={labelCls}>
                        <span>
                          Complément <span className="font-medium text-faint">(facultatif)</span>
                        </span>
                        <input value={party.line2} onChange={setP("line2")} className={field} />
                      </label>
                      <div className="grid grid-cols-[1fr_2fr] gap-3 max-[449px]:grid-cols-1">
                        <label className={labelCls}>
                          <span>Code postal</span>
                          <input value={party.postalCode} onChange={setP("postalCode")} className={field} />
                        </label>
                        <label className={labelCls}>
                          <span>Ville</span>
                          <input value={party.city} onChange={setP("city")} className={field} />
                        </label>
                      </div>
                      <label className={labelCls}>
                        <span>Pays</span>
                        <input value={party.country} onChange={setP("country")} maxLength={2} className={`${field} !w-28 uppercase`} />
                      </label>
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
                    <span className="text-[0.8125rem] font-bold">Vous agissez en tant que</span>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qualité du signataire">
                      {STATUSES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={status === s.value}
                          onClick={() => setStatus(s.value)}
                          className={`rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${status === s.value ? "bg-ink text-white" : "bg-paper hover:opacity-70"}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {professional && (
                    <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
                      <label className={labelCls}>
                        <span>Nom commercial ou raison sociale</span>
                        <input value={signer.companyName} onChange={setS("companyName")} className={field} />
                      </label>
                      <label className={labelCls}>
                        <span>SIRET</span>
                        <input value={signer.siret} onChange={setS("siret")} placeholder="123 456 789 00012" className={field} />
                      </label>
                      <label className={`${labelCls} col-span-2 max-[599px]:col-span-1`}>
                        <span>
                          TVA intracommunautaire <span className="font-medium text-faint">(si applicable)</span>
                        </span>
                        <input value={signer.vatNumber} onChange={setS("vatNumber")} placeholder="FR12345678901" className={field} />
                      </label>
                    </div>
                  )}

                  <label className={labelCls}>
                    <span>Pays de résidence fiscale</span>
                    <input value={signer.taxCountry} onChange={setS("taxCountry")} maxLength={2} className={`${field} !w-28 uppercase`} />
                  </label>
                </div>
              </div>

              {/* La lecture : proposée en noir tant qu'elle n'a pas eu lieu, constatée en vert ensuite. */}
              {upToDate ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tint-green px-5 py-4">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[0.8125rem] font-extrabold text-tint-green-ink">Contrat lu jusqu&apos;au bout.</span>
                    <span className="text-[0.6875rem] font-semibold text-tint-green-ink">Rempli de vos informations · version {contract.version}</span>
                  </span>
                  <button type="button" onClick={() => setReading(true)} className="whitespace-nowrap border-b-[1.5px] border-ink text-xs font-bold">
                    Le relire
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-deep px-5 py-[1.125rem] text-on-deep max-[599px]:flex-col max-[599px]:items-stretch">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold">{stale ? "Vos informations ont changé" : "Lire le contrat"}</span>
                    <span className="text-xs leading-relaxed text-on-deep-muted">
                      {stale
                        ? "Le contrat a été refait avec vos nouvelles informations : relisez-le avant de l'accepter."
                        : "Il s'ouvre rempli de vos informations. Les attestations et la signature viennent ensuite."}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReading(true)}
                    disabled={!partyOk}
                    className="whitespace-nowrap rounded-pill bg-white px-6 py-3.5 text-[0.8125rem] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {stale ? "Relire le contrat" : "Ouvrir le contrat"}
                  </button>
                </div>
              )}
            </Step>
          )}

          {/* ---------- 3 · Attester et signer ---------- */}
          {contract && (
            <Step n={3} title="Attester et signer" className={`${only(3)} ${upToDate ? "" : "opacity-60"}`} numbered aside={`${checkedCount} sur ${CHECKS.length}`}>
              {!upToDate && (
                <span className="w-fit rounded-xl bg-tint-sand px-3 py-2.5 text-xs font-semibold text-tint-sand-ink">
                  Lisez d&apos;abord le contrat pour pouvoir attester.
                </span>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 max-[899px]:grid-cols-1">
                {CHECKS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    role="checkbox"
                    aria-checked={Boolean(checks[c.name])}
                    disabled={!upToDate}
                    onClick={() => setChecks((s) => ({ ...s, [c.name]: !s[c.name] }))}
                    className="grid grid-cols-[22px_1fr] items-start gap-3 text-left text-[0.8125rem] leading-[1.55] text-[#333] disabled:cursor-not-allowed"
                  >
                    <span className={`mt-px flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px] border-ink text-xs font-extrabold ${checks[c.name] ? "bg-ink text-white" : ""}`}>
                      {checks[c.name] ? "✓" : ""}
                    </span>
                    <span>
                      {c.text}
                      {!c.required && <span className="text-subtle"> (facultatif)</span>}
                    </span>
                  </button>
                ))}
              </div>

              <label className={`${labelCls} border-t border-line-soft pt-4`}>
                <span>Signature — saisissez vos prénom et nom</span>
                <input
                  value={signer.signerTypedName}
                  onChange={setS("signerTypedName")}
                  disabled={!upToDate}
                  placeholder={`${me.firstName} ${me.lastName}`.trim() || "Camille Dupont"}
                  className={`${field} !py-[1.125rem] !text-lg !font-extrabold !tracking-[-0.01em] disabled:cursor-not-allowed`}
                />
              </label>
              <span className="text-xs font-medium leading-[1.55] text-subtle">
                En saisissant votre nom, vous confirmez votre acceptation du contrat et des engagements qu&apos;il
                contient. L&apos;acceptation sera horodatée.
              </span>

              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(checks.newsletterOptIn)}
                onClick={() => setChecks((s) => ({ ...s, newsletterOptIn: !s.newsletterOptIn }))}
                className="grid grid-cols-[22px_1fr] items-start gap-3 border-t border-line-soft pt-4 text-left text-xs leading-[1.55] text-subtle"
              >
                <span className={`mt-px flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px] border-ink text-xs font-extrabold ${checks.newsletterOptIn ? "bg-ink text-white" : ""}`}>
                  {checks.newsletterOptIn ? "✓" : ""}
                </span>
                <span>
                  Je souhaite recevoir par e-mail les actualités de Mon Vrai. <span className="text-faint">(facultatif, sans effet sur le contrat)</span>
                </span>
              </button>
            </Step>
          )}

          {error && (
            <p role="alert" className="rounded-card bg-tint-pink px-5 py-4 text-[0.8125rem] font-semibold text-tint-pink-ink">
              {error}
            </p>
          )}

          {/* ---------- Valider, sur grand écran ---------- */}
          <div className="flex flex-col gap-2 max-[1099px]:hidden">
            <button
              type="button"
              onClick={submit}
              disabled={!ready || pending}
              className="w-full rounded-pill bg-ink py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Envoi…" : contract ? "Accepter le contrat et commander" : "Commander mon kit"}
            </button>
            <span className="text-center text-[0.6875rem] text-subtle">
              {ready ? "Aucun paiement : le kit est offert, port compris." : stepHint}
            </span>
          </div>
        </div>

        {/* ---------- Ce que vous recevez, et où l'on en est ---------- */}
        <aside className="sticky top-6 flex flex-col gap-3.5 max-[1099px]:hidden">
          <div className="flex flex-col gap-3 rounded-card bg-tint-green p-7">
            <span className="text-base font-extrabold">Ce que vous recevez</span>
            {items.map((item, i) => (
              <div key={item.slug} className={`flex items-center gap-3 ${i > 0 ? "border-t border-white/60 pt-3" : ""}`}>
                {item.image ? (
                  <Image src={item.image} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-2xl bg-white object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded-2xl bg-white" />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[0.8125rem] font-bold">{item.title}</span>
                  <span className="text-xs text-tint-green-ink">{item.qty > 1 ? `${item.qty} exemplaires` : "1 exemplaire"}</span>
                </span>
              </div>
            ))}
            <span className="border-t border-white/60 pt-3 text-[0.8125rem] font-extrabold">Offert · livraison comprise</span>
            {prototype && (
              <span className="text-xs text-tint-green-ink">Ces exemplaires sont des prototypes : la version définitive peut différer légèrement.</span>
            )}
          </div>

          {contract && (
            <div className="flex flex-col rounded-card bg-surface px-5 py-1.5">
              {[
                { label: "Livraison", done: addressOk, note: relay?.name ?? (addressOk ? "Adresse complète" : "À compléter") },
                { label: "Contrat", done: partyOk && upToDate, note: upToDate ? "Lu" : stale ? "À relire" : "Non lu" },
                { label: "Attester et signer", done: checksOk && signedOk, note: `${checkedCount} sur ${CHECKS.length}` },
              ].map((s, i) => (
                <div key={s.label} className={`flex items-center gap-3 py-3 ${i < 2 ? "border-b border-line-soft" : ""}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-[0.6875rem] font-extrabold ${s.done ? "bg-tint-green text-tint-green-ink" : "bg-paper"}`}>
                    {s.done ? "✓" : i + 1}
                  </span>
                  <span className="flex-1 text-[0.8125rem] font-bold">{s.label}</span>
                  <span className="truncate text-xs text-subtle">{s.note}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ---------- Valider, posé en bas de l'écran, sur petit écran ---------- */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-transparent to-paper to-30% pb-6 pt-5 min-[1100px]:hidden">
        <button
          type="button"
          onClick={onCta}
          disabled={(step === totalSteps ? !ready : !canLeaveStep) || pending}
          className="w-full rounded-pill bg-ink py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Envoi…" : ctaLabel}
        </button>
        <span className="text-center text-[0.6875rem] text-subtle">{stepHint}</span>
      </div>

      {reading && contract && (
        <ContractDialog
          title={contract.name}
          typeLabel={contract.typeLabel}
          version={contract.version}
          body={filled.body}
          signerName={`${me.firstName} ${me.lastName}`.trim()}
          alreadyRead={upToDate}
          onClose={() => setReading(false)}
          onRead={() => {
            setReadText(filled.body);
            setReading(false);
          }}
        />
      )}
    </div>
  );
}

/*
 * Une étape : son numéro dans une pastille, son titre, et ce qu'elle demande. Le numéro
 * ne s'affiche que s'il y a un contrat — sans lui il n'y a qu'une étape, et « 1 » tout
 * seul ne numérote rien.
 */
function Step({
  n,
  title,
  aside,
  numbered,
  className = "",
  children,
}: {
  n: number;
  title: string;
  aside?: string;
  numbered: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${card} ${numbered ? "min-[1100px]:grid min-[1100px]:grid-cols-[36px_1fr] min-[1100px]:gap-5" : ""} ${className}`}>
      {numbered && (
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-ink text-sm font-extrabold text-white max-[1099px]:hidden">{n}</span>
      )}
      <div className="flex min-w-0 flex-col gap-[1.125rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-lg font-extrabold">{title}</span>
          {aside && <span className="text-xs font-semibold text-subtle">{aside}</span>}
        </div>
        {children}
      </div>
    </section>
  );
}
