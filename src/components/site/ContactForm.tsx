"use client";

import { useActionState } from "react";
import { sendContactMessage, type ContactResult } from "@/lib/contact/actions";

/*
 * Formulaire de contact de la maquette (4b). Les sujets sont des boutons radio
 * habillés en pastilles : la valeur part avec le message, et le clavier comme les
 * lecteurs d'écran y accèdent normalement.
 */

type Props = { subjects: string[]; legal: string; successText: string };

const field = "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink";
const label = "flex flex-col gap-2 text-[0.8125rem] font-bold";

export function ContactForm({ subjects, legal, successText }: Props) {
  const [state, action, pending] = useActionState<ContactResult | null, FormData>(
    async (_prev, formData) => sendContactMessage(formData),
    null,
  );

  if (state?.ok) {
    return (
      <p role="status" className="rounded-[14px] bg-tint-green px-5 py-4 text-sm font-semibold text-tint-green-ink">
        {successText}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state && !state.ok && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-5 py-3.5 text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 max-[899px]:grid-cols-1">
        <label className={label}>
          <span>Nom</span>
          <input name="name" type="text" autoComplete="name" placeholder="Votre nom" className={field} />
        </label>
        <label className={label}>
          <span>
            E-mail <span className="text-accent" aria-hidden="true">*</span>
          </span>
          <input name="email" type="email" required autoComplete="email" placeholder="vous@exemple.fr" className={field} />
        </label>
      </div>

      <label className={label}>
        <span>
          Téléphone <span className="font-medium text-faint">(facultatif)</span>
        </span>
        <input name="phone" type="tel" autoComplete="tel" placeholder="06 …" className={field} />
      </label>

      {subjects.length > 0 && (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="pb-2 text-[0.8125rem] font-bold">Sujet</legend>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s, i) => (
              <label key={s} className="relative cursor-pointer rounded-pill bg-paper px-4 py-2.5 text-[0.8125rem] font-semibold has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ink">
                <input type="radio" name="subject" value={s} defaultChecked={i === 0} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className={label}>
        <span>Message</span>
        <textarea name="body" rows={6} required placeholder="Dites-nous tout…" className={`${field} min-h-[140px] resize-y`} />
      </label>

      {/* Piège à robots : invisible, ne doit jamais être rempli. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="flex flex-wrap items-center justify-between gap-5 pt-1">
        {legal && <span className="max-w-[340px] text-xs leading-relaxed text-subtle">{legal}</span>}
        <button type="submit" disabled={pending} className="flex-none rounded-pill bg-ink px-7 py-4 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Envoi…" : "Envoyer le message"}
        </button>
      </div>
    </form>
  );
}
