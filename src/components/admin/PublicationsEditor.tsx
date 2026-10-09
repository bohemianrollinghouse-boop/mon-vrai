"use client";

import { useState } from "react";

/*
 * Les parutions qu'un contrat exige : « 2 vidéos TikTok », « 1 story Instagram ».
 *
 * Une ligne par nature de parution, avec son nombre — et non une ligne par exemplaire :
 * c'est l'écran de la campagne qui dépliera « 2 » en deux cases à cocher. Écrire deux
 * fois « Vidéo TikTok » reviendrait à décrire le même engagement deux fois.
 *
 * Tout se sérialise dans un champ caché, en JSON : le formulaire reste un formulaire,
 * sans état serveur à tenir. Les identifiants sont posés par l'action à l'enregistrement
 * — c'est eux qui rattachent un lien à sa ligne quand on la renomme.
 */

export type PublicationLine = { id: string; label: string; qty: number };

const SUGGESTIONS = ["Vidéo TikTok", "Réel Instagram", "Story Instagram", "Post en collaboration", "Vidéo YouTube", "Publication Facebook"];

export function PublicationsEditor({ initial, suggested = [] }: { initial: PublicationLine[]; suggested?: PublicationLine[] }) {
  const [lines, setLines] = useState<PublicationLine[]>(initial);

  const patch = (i: number, p: Partial<PublicationLine>) => setLines((l) => l.map((line, k) => (k === i ? { ...line, ...p } : line)));
  const add = (label: string) => setLines((l) => [...l, { id: "", label, qty: 1 }]);

  /* Ce que le résumé du contrat annonce déjà et qui n'est pas encore dans la liste. Le
     reprendre évite de ressaisir en chiffres ce qui est écrit juste au-dessus. */
  const missing = suggested.filter((s) => !lines.some((l) => l.label.toLowerCase() === s.label.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      {/* Les lignes vides sont écartées à l'enregistrement : rien à valider ici. */}
      <input type="hidden" name="publications" value={JSON.stringify(lines)} />

      {lines.length === 0 && (
        <span className="text-[0.8125rem] text-subtle">Aucune parution exigée par ce contrat. Les fichiers reçus se comptent à part.</span>
      )}

      {missing.length > 0 && (
        <button
          type="button"
          onClick={() => setLines((l) => [...l, ...missing])}
          className="w-fit cursor-pointer rounded-pill bg-tint-blue px-3 py-2 text-[0.6875rem] font-bold text-tint-blue-ink hover:opacity-70"
        >
          Reprendre du résumé : {missing.map((m) => (m.qty > 1 ? `${m.qty} × ${m.label}` : m.label)).join(", ")}
        </button>
      )}

      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
          <input
            value={line.label}
            onChange={(e) => patch(i, { label: e.target.value })}
            placeholder="Vidéo TikTok"
            aria-label="Nature de la parution"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[0.8125rem] font-semibold outline-none"
          />
          <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-bold text-subtle">
            ×
            <input
              type="number"
              min={1}
              max={20}
              value={line.qty}
              onChange={(e) => patch(i, { qty: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
              aria-label="Combien de fois"
              className="w-12 rounded-lg bg-paper px-2 py-1.5 text-right text-[0.8125rem] font-extrabold text-ink outline-none"
            />
          </span>
          <button
            type="button"
            onClick={() => setLines((l) => l.filter((_, k) => k !== i))}
            className="shrink-0 cursor-pointer text-[0.6875rem] font-bold text-accent underline"
          >
            Retirer
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.filter((s) => !lines.some((l) => l.label === s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="cursor-pointer rounded-pill bg-surface px-3 py-1.5 text-[0.6875rem] font-bold hover:opacity-70"
          >
            + {s}
          </button>
        ))}
        <button type="button" onClick={() => add("")} className="cursor-pointer rounded-pill bg-ink px-3 py-1.5 text-[0.6875rem] font-bold text-on-deep">
          + Autre
        </button>
      </div>
    </div>
  );
}
