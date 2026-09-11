"use client";

import { useState, useTransition } from "react";
import type { PartnerResult } from "@/lib/auth/partner-actions";

/*
 * Coordonnées bancaires du partenaire. Affichées masquées : une capture d'écran de
 * l'espace ne doit pas livrer un IBAN complet. Le champ ne s'ouvre qu'à la demande,
 * et repart vide — on ne le pré-remplit pas avec la valeur enregistrée.
 */
export function IbanForm({ masked, action }: { masked: string; action: (fd: FormData) => Promise<PartnerResult> }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (fd: FormData) =>
    start(async () => {
      const result = await action(fd);
      setNotice(result.ok ? result.message : result.error);
      if (result.ok) setOpen(false);
    });

  return (
    <div className="flex flex-col gap-2.5 rounded-thumb bg-paper px-4 py-3.5 text-[0.8125rem]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-bold">{masked ? `Virement vers ${masked}` : "Aucune coordonnée bancaire"}</span>
          <span className="text-xs text-subtle">Facture ou note d'auteur à joindre chaque mois.</span>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="whitespace-nowrap border-b-[1.5px] border-ink text-xs font-bold">
          {open ? "Annuler" : masked ? "Modifier" : "Renseigner"}
        </button>
      </div>

      {open && (
        <form action={submit} className="flex flex-wrap items-center gap-2">
          <input
            name="iban"
            defaultValue=""
            placeholder="FR76 3000 6000 0112 3456 7890 189"
            aria-label="IBAN"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-[10px] bg-white px-3 py-2.5 text-[0.8125rem] font-semibold outline-none"
          />
          <button type="submit" disabled={pending} className="rounded-pill bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {pending ? "…" : "Enregistrer"}
          </button>
        </form>
      )}

      {notice && <span className="text-xs font-semibold text-tint-green-ink">{notice}</span>}
    </div>
  );
}
