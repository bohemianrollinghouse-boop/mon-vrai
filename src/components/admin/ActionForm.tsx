"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import type { AdminResult } from "@/lib/admin/types";
import { IssuesContext } from "./issues-context";
import { Toast } from "./Toast";
import { Button } from "./ui";

/*
 * Enveloppe commune des formulaires de l'admin : un vrai <form> vers une action
 * serveur, le résultat affiché sans rechargement, une redirection si l'action le
 * demande (après une création, vers la fiche créée). Les erreurs par champ sont
 * publiées dans IssuesContext : un <Field name="…"> les affiche sous le bon champ.
 */

type Props = {
  action: (formData: FormData) => Promise<AdminResult>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  /** Bouton secondaire (annuler, retour…) rendu à côté du bouton principal. */
  secondary?: ReactNode;
  /** Demande une confirmation avant d'envoyer (suppressions). */
  confirm?: string;
  /** Ton du bouton principal (« secondary » = pilule blanche, pour les cartes sombres). */
  submitTone?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  /** Sans pied de formulaire : le bouton d'envoi est ailleurs (en-tête), relié par `id`. */
  hideFooter?: boolean;
  id?: string;
  /** Texte d'aide à gauche du bouton. */
  footerNote?: ReactNode;
};

export function ActionForm({ action, children, submitLabel = "Enregistrer", className = "", secondary, confirm, submitTone = "primary", hideFooter = false, id, footerNote }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminResult | null, FormData>(async (_prev, fd) => action(fd), null);

  /*
   * Redirection OU rafraîchissement, jamais les deux. `router.refresh()` relit la route
   * COURANTE : après une suppression, c'est la fiche qu'on vient d'effacer, et la page
   * répondait 404 le temps que la redirection aboutisse. `replace` évite en plus de
   * laisser la page morte dans l'historique, où le bouton Retour la retrouverait.
   */
  useEffect(() => {
    if (!state?.ok) return;
    if (state.redirectTo) router.replace(state.redirectTo);
    else router.refresh();
  }, [state, router]);

  /*
   * Le message flotte hors du flux (voir Toast) : inséré dans le formulaire, il
   * décalait la ligne d'un tableau à chaque clic sur un bouton compact.
   *
   * Il se DÉDUIT du résultat plutôt que d'être recopié dans un état : on ne mémorise
   * que le résultat déjà congédié, pour qu'un message fermé ne revienne pas.
   */
  const [dismissed, setDismissed] = useState<AdminResult | null>(null);
  const notice =
    state && state !== dismissed
      ? state.ok
        ? state.message
          ? ({ tone: "ok", text: state.message } as const)
          : null
        : ({ tone: "error", text: state.error } as const)
      : null;

  const issues = state && !state.ok ? state.issues ?? {} : {};

  return (
    <form
      id={id}
      action={formAction}
      className={`flex flex-col gap-5 ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {notice && <Toast tone={notice.tone} message={notice.text} onClose={() => setDismissed(state)} />}
      <IssuesContext.Provider value={issues}>{children}</IssuesContext.Provider>
      {!hideFooter && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {footerNote ? <span className="text-xs text-subtle">{footerNote}</span> : <span />}
          <div className="flex flex-wrap items-center gap-2">
            {secondary}
            <Button tone={submitTone} disabled={pending}>
              {pending ? "…" : submitLabel}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
