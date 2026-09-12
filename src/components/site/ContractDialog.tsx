"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Signature du contrat de collaboration.
 *
 * Le texte défile dans son propre cadre ; tout ce qu'il faut remplir — attestations,
 * identité, nom de signature, bouton — reste DEHORS, toujours visible. Sans quoi il
 * faudrait remonter tout le contrat pour retrouver le bouton.
 *
 * Le bouton reste grisé tant que le contrat n'a pas été déroulé jusqu'en bas, et la
 * raison est écrite au-dessus : un contrat qu'on accepte sans l'avoir fait défiler
 * n'engage pas grand-chose. La condition se relâche aussi quand le texte tient dans le
 * cadre sans défilement — sinon le bouton ne s'activerait jamais.
 */

export type ContractView = {
  name: string;
  version: string;
  typeLabel: string;
  summary: string;
  body: string;
  /** Les livres offerts et leur valeur, tels qu'ils figureront au contrat. */
  products: { title: string; qty: number; value: string }[];
  totalValue: string;
};

const field =
  "w-full rounded-[12px] bg-paper px-4 py-3 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-[1.5px] focus-visible:outline-offset-0 focus-visible:outline-ink";
const label = "flex flex-col gap-1.5 text-[0.8125rem] font-bold";

/* Les attestations. « childAuthorisation » est un engagement conditionnel, pas une
   attestation : elle n'est pas exigée pour valider. */
const CHECKS = [
  { name: "adult", required: true, text: "Je certifie avoir 18 ans ou plus et avoir la capacité de conclure le présent contrat." },
  { name: "readAll", required: true, text: "Je confirme avoir lu l'intégralité du contrat de collaboration affiché ci-dessus." },
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

export function ContractDialog({ contract, signer, onClose, onAccept, pending, error }: {
  contract: ContractView;
  /* Prénom et nom viennent du formulaire de commande : on ne les redemande pas ici. */
  signer: { firstName: string; lastName: string };
  onClose: () => void;
  onAccept: (values: FormData) => void;
  pending: boolean;
  error: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"individual" | "sole_trader" | "company">("individual");
  const [form, setForm] = useState({ companyName: "", siret: "", vatNumber: "", taxCountry: "FR", signerTypedName: "" });

  /* Déroulé jusqu'en bas — ou texte trop court pour défiler, auquel cas il est lu d'emblée. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
      if (atBottom) setRead(true);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, []);

  const professional = status !== "individual";
  const missingChecks = CHECKS.filter((c) => c.required && !checks[c.name]).length;
  const identityOk = signer.firstName && signer.lastName && form.signerTypedName.trim() && (!professional || (form.siret.trim() && form.companyName.trim()));
  const ready = read && missingChecks === 0 && Boolean(identityOk) && !pending;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v);
    fd.set("firstName", signer.firstName);
    fd.set("lastName", signer.lastName);
    fd.set("signerStatus", status);
    for (const c of CHECKS) if (checks[c.name]) fd.set(c.name, "on");
    onAccept(fd);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={contract.name}>
      <div className="flex max-h-[92vh] w-full max-w-[46rem] flex-col gap-4 rounded-panel bg-white p-7 max-[599px]:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Contrat · {contract.typeLabel}</span>
            <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">{contract.name}</h2>
            <span className="text-xs text-subtle">Version {contract.version}</span>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-xs font-bold underline" disabled={pending}>
            Fermer
          </button>
        </div>

        {/* ---------- Résumé : personne ne lit un contrat en entier ---------- */}
        {contract.summary.trim() && (
          <div className="flex flex-col gap-2 rounded-card bg-tint-green p-5">
            <span className="text-sm font-extrabold">Votre collaboration</span>
            <ul className="flex flex-col gap-1 text-[0.8125rem] leading-relaxed text-tint-green-ink">
              {contract.summary
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">·</span>
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
            <span className="text-xs text-tint-green-ink">Ce résumé ne remplace pas le contrat : il est en dessous, en entier.</span>
          </div>
        )}

        {/* ---------- Ce qui est offert, et sa valeur ---------- */}
        {contract.products.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-card bg-paper p-5 text-[0.8125rem]">
            <span className="font-extrabold">Produits remis</span>
            {contract.products.map((p) => (
              <span key={p.title} className="flex justify-between gap-3">
                <span>
                  {p.title}
                  {p.qty > 1 ? ` × ${p.qty}` : ""}
                </span>
                <span className="font-semibold">{p.value}</span>
              </span>
            ))}
            <span className="flex justify-between gap-3 border-t border-line-soft pt-1.5 font-extrabold">
              <span>Valeur de l&apos;avantage en nature</span>
              <span>{contract.totalValue}</span>
            </span>
          </div>
        )}

        {/* ---------- Le contrat, dans son propre cadre ---------- */}
        <div ref={scroller} className="min-h-[9rem] flex-1 overflow-y-auto rounded-card border border-line bg-surface p-5 text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
          {contract.body}
        </div>
        <span className={`text-xs font-semibold ${read ? "text-tint-green-ink" : "text-subtle"}`} role="status">
          {read ? "Contrat lu jusqu'au bout — vous pouvez l'accepter." : "Faites défiler le contrat jusqu'en bas pour pouvoir l'accepter."}
        </span>

        {/* ---------- Hors du cadre : tout ce qu'il faut remplir ---------- */}
        <div className="flex max-h-[38vh] flex-col gap-3 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {CHECKS.map((c) => (
              <label key={c.name} className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-relaxed">
                <input
                  type="checkbox"
                  checked={Boolean(checks[c.name])}
                  onChange={(e) => setChecks((p) => ({ ...p, [c.name]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                />
                <span>
                  {c.text}
                  {!c.required && <span className="text-subtle"> (le cas échéant)</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1 rounded-[12px] bg-paper px-4 py-3 text-[0.8125rem]">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Vous signez en tant que</span>
            <span className="font-bold">
              {signer.firstName} {signer.lastName}
            </span>
            <span className="text-xs text-subtle">Repris du formulaire de commande. Fermez cette fenêtre pour le corriger.</span>
          </div>

          <div className="flex flex-col gap-2">
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
                  onClick={() => setStatus(value)}
                  aria-pressed={status === value}
                  className={`rounded-pill px-4 py-2.5 text-[0.8125rem] ${status === value ? "bg-ink font-bold text-white" : "bg-paper font-semibold hover:opacity-70"}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {professional && (
            <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
              <label className={label}>
                <span>Nom commercial ou raison sociale</span>
                <input value={form.companyName} onChange={set("companyName")} className={field} />
              </label>
              <label className={label}>
                <span>SIRET</span>
                <input value={form.siret} onChange={set("siret")} inputMode="numeric" placeholder="123 456 789 00012" className={field} />
              </label>
              <label className={label}>
                <span>
                  TVA intracommunautaire <span className="font-medium text-faint">(si applicable)</span>
                </span>
                <input value={form.vatNumber} onChange={set("vatNumber")} placeholder="FR12345678901" className={field} />
              </label>
            </div>
          )}

          <label className={label}>
            <span>Pays de résidence fiscale</span>
            <input value={form.taxCountry} onChange={(e) => setForm((f) => ({ ...f, taxCountry: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="FR" className={`${field} w-24`} />
          </label>

          <label className={label}>
            <span>Signature — saisissez vos prénom et nom</span>
            <input value={form.signerTypedName} onChange={set("signerTypedName")} placeholder={`${signer.firstName} ${signer.lastName}`.trim() || "Prénom Nom"} className={field} />
            <span className="text-xs font-medium leading-relaxed text-subtle">
              En saisissant votre nom et en validant, vous confirmez votre acceptation du contrat et des engagements qu&apos;il contient.
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
        </div>

        {error && <p className="rounded-[12px] bg-tint-pink px-4 py-3 text-[0.8125rem] font-semibold text-tint-pink-ink">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          className="rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Envoi…" : "Accepter le contrat et confirmer ma commande"}
        </button>
      </div>
    </div>
  );
}
