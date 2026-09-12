"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/*
 * Message de retour d'une action, posé HORS du flux : il flotte en bas à droite de la
 * fenêtre, par un portail vers <body>.
 *
 * Il vivait auparavant dans le formulaire lui-même. Sur les grands formulaires cela se
 * voyait à peine, mais sur les boutons compacts glissés dans un tableau — « Actualiser »
 * d'un envoi, les + et − du stock, les flèches de la FAQ — l'apparition du message
 * décalait la ligne entière, et parfois toute la page.
 *
 * Une erreur reste affichée : il faut pouvoir la lire. Une confirmation s'efface d'elle-
 * même au bout de quelques secondes.
 */

const SUCCESS_MS = 4000;

export function Toast({ tone, message, onClose }: { tone: "ok" | "error"; message: string; onClose: () => void }) {
  useEffect(() => {
    if (tone !== "ok") return;
    const id = setTimeout(onClose, SUCCESS_MS);
    return () => clearTimeout(id);
  }, [tone, message, onClose]);

  /*
   * Pas de garde « monté » : ce composant n'existe qu'après une action, donc jamais
   * pendant le rendu serveur du formulaire — `document` est toujours là quand on y arrive.
   */
  const cls = tone === "ok" ? "bg-tint-green text-tint-green-ink" : "bg-danger-bg text-danger";
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[10000] flex justify-end p-5 max-[599px]:justify-center">
      <p
        role={tone === "error" ? "alert" : "status"}
        className={`pointer-events-auto flex max-w-[28rem] items-start gap-3 rounded-[14px] px-4 py-3 text-sm font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${cls}`}
      >
        <span className="min-w-0">{message}</span>
        <button type="button" onClick={onClose} aria-label="Fermer" className="shrink-0 text-base leading-none opacity-60 hover:opacity-100">
          ×
        </button>
      </p>
    </div>,
    document.body,
  );
}
