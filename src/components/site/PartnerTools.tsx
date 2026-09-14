"use client";

import { useState } from "react";

/*
 * Le code et le lien du partenaire, posés dans le héros.
 *
 * Ce sont ses deux outils de travail : il vient les chercher à chaque publication, et
 * leur place n'est pas au milieu d'une page mais sous le pouce, dès l'ouverture. Le code
 * porte l'aplat noir — c'est lui qu'on dicte en story ; le lien reste en blanc, on le
 * colle sans le lire.
 *
 * Le presse-papiers peut être refusé (permission, contexte non sécurisé) : on retombe
 * alors sur une sélection du texte, pour que le geste reste possible à la main.
 */
function useCopy(): [boolean, (value: string, id: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const node = document.getElementById(id);
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  };
  return [copied, copy];
}

export function PartnerTools({ code, discount, link }: { code: string; discount: number; link: string }) {
  const [codeCopied, copyCode] = useCopy();
  const [linkCopied, copyLink] = useCopy();

  return (
    <div className="flex flex-col gap-2.5">
      {code && (
        <div className="flex items-center gap-3 rounded-[20px] bg-ink py-2.5 pl-[1.375rem] pr-2.5 text-white">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-on-deep-muted">Votre code · −{discount} %</span>
            <span id="partner-code" className="truncate text-[1.75rem] font-extrabold leading-[1.1] tracking-[0.06em] max-[599px]:text-[1.375rem]">
              {code}
            </span>
          </span>
          <button
            type="button"
            onClick={() => copyCode(code, "partner-code")}
            className="whitespace-nowrap rounded-pill bg-white px-[1.125rem] py-3.5 text-[0.8125rem] font-bold text-ink hover:opacity-80"
          >
            {codeCopied ? "Copié ✓" : "Copier"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-[20px] bg-surface py-2.5 pl-[1.375rem] pr-2.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-subtle">Votre lien · attribution 30 jours</span>
          <span id="partner-link" className="truncate text-sm font-semibold text-muted">
            {link.replace(/^https?:\/\//, "")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => copyLink(link, "partner-link")}
          className="whitespace-nowrap rounded-pill bg-paper px-[1.125rem] py-3.5 text-[0.8125rem] font-bold hover:opacity-70"
        >
          {linkCopied ? "Copié ✓" : "Copier"}
        </button>
      </div>
    </div>
  );
}
