"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import type { AdminResult } from "@/lib/admin/types";
import { IssuesContext } from "./issues-context";
import { Button, Notice } from "./ui";

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
};

export function ActionForm({ action, children, submitLabel = "Enregistrer", className = "", secondary, confirm }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminResult | null, FormData>(async (_prev, fd) => action(fd), null);

  useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
    if (state?.ok) router.refresh();
  }, [state, router]);

  const issues = state && !state.ok ? state.issues ?? {} : {};

  return (
    <form
      action={formAction}
      className={`flex flex-col gap-5 ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && state.message && <Notice tone="ok">{state.message}</Notice>}
      <IssuesContext.Provider value={issues}>{children}</IssuesContext.Provider>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button disabled={pending}>{pending ? "…" : submitLabel}</Button>
        {secondary}
      </div>
    </form>
  );
}
