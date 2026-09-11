"use client";

import { useActionState } from "react";
import { sendProRequest, type ProResult } from "@/lib/contact/pro";
import { PRO_INTERESTS, PRO_KINDS } from "@/lib/contact/pro-options";
import { PillButton } from "./ui";

/*
 * Demande d'un professionnel. Même esprit que le formulaire de contact : le champ
 * « website » est un piège à robots, invisible et vide pour un humain.
 */
const field = "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const label = "text-[0.8125rem] font-bold";

export function ProRequestForm({ legal }: { legal: string }) {
  const [state, action, pending] = useActionState<ProResult | null, FormData>(async (_prev, fd) => sendProRequest(fd), null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-2 rounded-panel bg-tint-green p-12 max-[749px]:p-8">
        <span className="text-lg font-extrabold">Merci, c'est bien reçu.</span>
        <span className="text-sm leading-relaxed text-tint-green-ink">
          Nous revenons vers vous sous 48 h ouvrées avec une proposition adaptée.
        </span>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5 rounded-panel bg-white p-12 max-[749px]:p-8">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" />

      <fieldset className="flex flex-col gap-2">
        <legend className={label}>
          Vous êtes <span className="text-accent">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PRO_KINDS.map((k, i) => (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="peer sr-only" />
              <span className="inline-flex rounded-pill bg-paper px-4 py-2.5 text-[0.8125rem] font-semibold peer-checked:bg-ink peer-checked:text-white">{k}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 max-[749px]:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className={label}>
            Structure <span className="text-accent">*</span>
          </span>
          <input name="structure" required maxLength={120} placeholder="Nom de votre structure" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Ville</span>
          <input name="city" maxLength={80} placeholder="Lyon" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>
            Votre nom <span className="text-accent">*</span>
          </span>
          <input name="name" required maxLength={120} placeholder="Prénom Nom" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>
            E-mail professionnel <span className="text-accent">*</span>
          </span>
          <input name="email" type="email" required placeholder="vous@structure.fr" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>
            Téléphone <span className="font-medium text-subtle">(facultatif)</span>
          </span>
          <input name="phone" maxLength={40} placeholder="04 …" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Nombre d'enfants ou de points de vente</span>
          <input name="size" maxLength={80} placeholder="ex. 24 enfants, 2 sections" className={field} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={label}>Ce qui vous intéresse</legend>
        <div className="flex flex-wrap gap-2">
          {PRO_INTERESTS.map((it) => (
            <label key={it} className="cursor-pointer">
              <input type="checkbox" name="interests" value={it} className="peer sr-only" />
              <span className="inline-flex rounded-pill bg-paper px-4 py-2.5 text-[0.8125rem] font-semibold peer-checked:bg-ink peer-checked:text-white">{it}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Votre projet</span>
        <textarea name="body" rows={4} maxLength={5000} placeholder="Quelques lignes suffisent : contexte, quantités envisagées, délais…" className={`${field} min-h-[8.75rem]`} />
      </label>

      {state && !state.ok && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-4 py-3 text-[0.8125rem] font-semibold text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {legal && <span className="max-w-[26rem] text-xs leading-relaxed text-subtle">{legal}</span>}
        <PillButton variant="dark" size="lg" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer ma demande"}
        </PillButton>
      </div>
    </form>
  );
}
