"use client";

import { useActionState } from "react";
import { subscribeNewsletter, type NewsletterResult } from "@/lib/newsletter/actions";

/*
 * Bandeau newsletter de la maquette : titre à gauche, champ en pilule à droite.
 * Composant client uniquement pour afficher le résultat sans recharger la page ;
 * l'inscription elle-même est une action serveur.
 */

type Props = {
  heading: string;
  text: string;
  placeholder: string;
  button: string;
};

export function Newsletter({ heading, text, placeholder, button }: Props) {
  const [state, action, pending] = useActionState<NewsletterResult | null, FormData>(
    async (_prev, formData) => subscribeNewsletter(formData),
    null,
  );

  return (
    <section className="site-wrap">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-10 rounded-panel bg-tint-sand px-16 py-14 max-[749px]:px-6 max-[749px]:py-8">
        <div className="flex max-w-[460px] flex-col gap-2">
          <h2 className="display-2">{heading}</h2>
          {text && <p className="text-[0.9375rem] leading-relaxed text-tint-sand-ink">{text}</p>}
        </div>

        {state?.ok ? (
          <p role="status" className="rounded-pill bg-white px-6 py-4 text-sm font-semibold">
            Merci ! Votre inscription est enregistrée.
          </p>
        ) : (
          <form action={action} className="flex min-w-[420px] flex-wrap items-center gap-2 rounded-pill bg-white p-1.5 pl-[1.375rem] max-[749px]:min-w-0 max-[749px]:w-full">
            <label htmlFor="newsletter-email" className="sr-only-keep">
              {placeholder}
            </label>
            <input
              id="newsletter-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            />
            <input type="hidden" name="source" value="site" />
            <button
              type="submit"
              disabled={pending}
              className="rounded-pill bg-ink px-[1.375rem] py-3.5 text-[0.8125rem] font-bold text-white disabled:opacity-60"
            >
              {pending ? "…" : button}
            </button>
            {state && !state.ok && (
              <p role="alert" className="basis-full px-2 pt-1 text-[0.8125rem] font-semibold text-danger">
                {state.error}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
