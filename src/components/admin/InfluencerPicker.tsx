"use client";

import { useMemo, useState } from "react";

/*
 * Cocher des partenaires pour leur appliquer une campagne.
 *
 * Les cases restent MONTÉES quand la recherche les écarte — simplement cachées : une
 * case démontée ne poste rien, et on perdrait en tapant une sélection déjà faite. Elles
 * se postent en `influencerIds[]`, que `formToObject` rassemble en tableau.
 */

export type PickerOption = {
  id: string;
  name: string;
  /** Sous le nom : pseudo, plateforme, où en est le démarchage. */
  note: string;
  /** À droite : sa situation vis-à-vis des campagnes (« Campagne en cours »…). */
  state?: string;
};

export function InfluencerPicker({ options, name = "influencerIds[]" }: { options: PickerOption[]; name?: string }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => new Set(options.filter((o) => !needle || `${o.name} ${o.note}`.toLowerCase().includes(needle)).map((o) => o.id)),
    [options, needle],
  );

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /* « Tout cocher » ne porte que sur ce qu'on voit : c'est ce qu'on croit cocher. */
  const allVisiblePicked = visible.size > 0 && [...visible].every((id) => picked.has(id));
  const toggleVisible = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of visible) {
        if (allVisiblePicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  if (options.length === 0) {
    return <p className="text-[0.8125rem] text-subtle">Tous les influenceurs participent déjà à cette campagne.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un nom, un pseudo…"
          className="min-w-0 flex-1 rounded-xl bg-paper px-3.5 py-2.5 text-[0.8125rem] outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-ink"
        />
        <button type="button" onClick={toggleVisible} disabled={visible.size === 0} className="whitespace-nowrap rounded-xl bg-paper px-3 py-2.5 text-xs font-bold hover:opacity-70 disabled:opacity-40">
          {allVisiblePicked ? "Tout décocher" : "Tout cocher"}
        </button>
      </div>

      <div className="flex max-h-80 flex-col overflow-y-auto rounded-xl border border-line">
        {options.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-center gap-3 border-b border-line-soft px-3 py-2.5 last:border-b-0 hover:bg-paper ${visible.has(o.id) ? "" : "hidden"}`}
          >
            <input
              type="checkbox"
              name={name}
              value={o.id}
              checked={picked.has(o.id)}
              onChange={(e) => toggle(o.id, e.target.checked)}
              className="h-4 w-4 shrink-0 accent-ink"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.8125rem] font-bold">{o.name}</span>
              <span className="truncate text-[0.6875rem] text-subtle">{o.note}</span>
            </span>
            {o.state && <span className="shrink-0 text-[0.6875rem] font-semibold text-faint">{o.state}</span>}
          </label>
        ))}
        {visible.size === 0 && <span className="px-3 py-4 text-[0.8125rem] text-subtle">Personne ne répond à cette recherche.</span>}
      </div>

      <span className="text-[0.6875rem] text-subtle">
        {picked.size === 0 ? "Aucun influenceur coché." : `${picked.size} coché${picked.size > 1 ? "s" : ""}.`}
      </span>
    </div>
  );
}
