"use client";

import { useState } from "react";

/*
 * Valeur à recopier (code promo, lien de suivi) avec un bouton qui confirme la copie.
 * Le presse-papiers peut être refusé (permission, contexte non sécurisé) : on retombe
 * alors sur une sélection du texte, pour que le geste reste possible à la main.
 */
export function CopyValue({ value, label, display }: { value: string; label: string; display: "code" | "link" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const node = document.getElementById(`copy-${display}`);
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      <span
        id={`copy-${display}`}
        className={
          display === "code"
            ? "flex-1 rounded-thumb bg-ink px-5 py-4 text-[1.625rem] font-extrabold tracking-[0.06em] text-white"
            : "min-w-0 flex-1 truncate rounded-[14px] bg-paper px-4 py-4 text-sm font-semibold text-muted"
        }
      >
        {value}
      </span>
      <button type="button" onClick={copy} className="whitespace-nowrap rounded-pill bg-paper px-4 py-3.5 text-[0.8125rem] font-bold hover:opacity-70">
        {copied ? "Copié ✓" : label}
      </button>
    </div>
  );
}
