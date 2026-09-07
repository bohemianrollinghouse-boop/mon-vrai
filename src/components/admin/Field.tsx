"use client";

import type { ReactNode } from "react";
import { useFieldIssue } from "./issues-context";

/** Libellé + champ + aide ou erreur. L'erreur vient de `error`, sinon du formulaire englobant via `name`. */
export function Field({
  label,
  name,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  /** Clé du champ dans les `issues` renvoyées par l'action (ex. `legal.footerLine`). */
  name?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const fromForm = useFieldIssue(name);
  const shown = error ?? fromForm;
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[0.8125rem] font-bold">{label}</span>
      {children}
      {hint && !shown && <span className="text-xs text-subtle">{hint}</span>}
      {shown && <span className="text-xs font-semibold text-danger">{shown}</span>}
    </label>
  );
}
