"use client";

import { useEffect, useRef, useState } from "react";
import { ContractText } from "@/components/site/ContractText";

/*
 * Lecture et acceptation du contrat.
 *
 * La fenêtre ne demande plus rien : tout a été rempli dans la page, et le contrat
 * s'affiche ici avec ces informations à leur place. Il ne reste qu'à le lire et à
 * l'accepter — d'où une fenêtre presque entièrement occupée par le texte.
 *
 * Le bouton reste grisé tant que le contrat n'a pas été déroulé jusqu'en bas, et la
 * raison est écrite juste à côté. La condition se relâche quand le texte tient dans le
 * cadre sans défilement, sinon le bouton ne s'activerait jamais.
 */
export function ContractDialog({
  title,
  typeLabel,
  version,
  body,
  signerName,
  accepted,
  onClose,
  onAccept,
}: {
  title: string;
  typeLabel: string;
  version: string;
  body: string;
  signerName: string;
  /** Déjà accepté : la fenêtre sert alors à relire, sans redemander. */
  accepted: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRead(true);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, []);

  /* Échap ferme : une fenêtre modale doit pouvoir se quitter au clavier. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-[48rem] flex-col gap-4 rounded-panel bg-white p-7 max-[599px]:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Contrat · {typeLabel}</span>
            <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">{title}</h2>
            <span className="text-xs text-subtle">Version {version}</span>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-xs font-bold underline">
            Fermer
          </button>
        </div>

        <div ref={scroller} className="min-h-[12rem] flex-1 overflow-y-auto rounded-card border border-line bg-surface px-6 py-5">
          <ContractText text={body} />
          {/* La signature ferme le document, comme sur un contrat imprimé. */}
          <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4 text-[0.8125rem]">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Accepté électroniquement par</span>
            <span className="text-base font-extrabold">{signerName || "—"}</span>
            <span className="text-xs text-subtle">L&apos;acceptation sera horodatée au moment où vous validerez.</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs font-semibold ${read ? "text-tint-green-ink" : "text-subtle"}`} role="status">
            {read ? "Contrat lu jusqu'au bout." : "Faites défiler le contrat jusqu'en bas pour pouvoir l'accepter."}
          </span>
          {accepted ? (
            <button type="button" onClick={onClose} className="rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white">
              Fermer
            </button>
          ) : (
            <button
              type="button"
              onClick={onAccept}
              disabled={!read}
              className="rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              J&apos;accepte le contrat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
