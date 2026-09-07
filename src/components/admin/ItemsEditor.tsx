"use client";

import { useState } from "react";

/*
 * Le « contenu du livre » : les six objets photographiés, un par double-page. Une
 * grille de puces éditables, comme dans la maquette ; la valeur part dans un champ
 * caché `items` (une ligne par objet), lu par l'action produit.
 */
export function ItemsEditor({ initial }: { initial: string[] }) {
  const [items, setItems] = useState<string[]>(initial.length ? initial : ["", "", "", "", "", ""]);
  const set = (i: number, v: string) => setItems(items.map((x, k) => (k === i ? v : x)));
  const remove = (i: number) => setItems(items.filter((_, k) => k !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setItems(copy);
  };

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="items" value={items.map((s) => s.trim()).filter(Boolean).join("\n")} readOnly />
      <div className="grid grid-cols-3 gap-2 max-[749px]:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-[0.8125rem] font-semibold">
            <span className="w-4 text-xs text-[#bbb]">{i + 1}</span>
            <input value={item} onChange={(e) => set(i, e.target.value)} placeholder="La pomme" aria-label={`Objet ${i + 1}`} className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-medium placeholder:text-faint" />
            <span className="flex gap-0.5 text-[#bbb]">
              <button type="button" onClick={() => move(i, -1)} aria-label="Avancer" className="px-0.5 hover:text-ink">‹</button>
              <button type="button" onClick={() => move(i, 1)} aria-label="Reculer" className="px-0.5 hover:text-ink">›</button>
              <button type="button" onClick={() => remove(i)} aria-label="Retirer" className="px-0.5 hover:text-accent">×</button>
            </span>
          </div>
        ))}
        {items.length < 12 && (
          <button type="button" onClick={() => setItems([...items, ""])} className="rounded-xl border-[1.5px] border-dashed border-[#ccc] px-3 py-2 text-[0.8125rem] font-semibold text-faint hover:border-ink hover:text-ink">
            + Ajouter
          </button>
        )}
      </div>
    </div>
  );
}
