"use client";

import { useEffect, useState } from "react";
import { ContractText } from "@/components/site/ContractText";

/*
 * Relecture d'un contrat déjà signé, tel qu'il a été accepté.
 *
 * Le texte conservé porte la même mise en forme légère que celui qui a été lu — titres,
 * gras, puces. L'afficher brut donnerait à relire des dièses et des astérisques ; on le
 * rend donc avec le même composant que la fenêtre de lecture.
 *
 * Rien n'y est modifiable : on relit, on imprime, on referme.
 */
export function SignedContractView({
  title,
  version,
  acceptedAt,
  signerName,
  reference,
  body,
  label = "Voir mon contrat",
}: {
  title: string;
  version: string;
  acceptedAt: string;
  signerName: string;
  reference: string;
  body: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-fit border-b-[1.5px] border-ink text-xs font-bold">
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
          <div className="flex max-h-[92vh] w-full max-w-[48rem] flex-col gap-4 rounded-panel bg-white p-7 max-[599px]:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Contrat accepté</span>
                <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">{title}</h2>
                <span className="text-xs text-subtle">
                  Version {version} · référence {reference}
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-xs font-bold underline">
                Fermer
              </button>
            </div>

            <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-card border border-line bg-surface px-6 py-5">
              <ContractText text={body} />
              <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4 text-[0.8125rem]">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Accepté électroniquement par</span>
                <span className="text-base font-extrabold">{signerName}</span>
                <span className="text-xs text-subtle">Le {acceptedAt}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-subtle">Ce texte est celui que vous avez accepté ; il n&apos;a pas bougé depuis.</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
