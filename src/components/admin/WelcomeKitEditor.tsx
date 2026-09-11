"use client";

import { useState } from "react";
import { Thumb } from "@/components/admin/ui";

/*
 * Sélection des livres du kit de bienvenue. La liste complète des titres, une case par
 * livre et une quantité ; le tout se sérialise dans un champ caché `slug:quantité`,
 * pour rester un simple formulaire (pas de state serveur à synchroniser).
 */

export type KitChoice = { slug: string; title: string; image?: string; tint: "green" | "blue" | "pink" | "sand"; stock: number | null };

export function WelcomeKitEditor({ products, initial }: { products: KitChoice[]; initial: { slug: string; qty: number }[] }) {
  const [picked, setPicked] = useState<Record<string, number>>(() => Object.fromEntries(initial.map((l) => [l.slug, l.qty])));

  const toggle = (slug: string) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[slug]) delete next[slug];
      else next[slug] = 1;
      return next;
    });

  // L'ordre de la sélection enregistrée est conservé, les ajouts viennent ensuite.
  const order = [...initial.map((l) => l.slug).filter((s) => picked[s]), ...Object.keys(picked).filter((s) => !initial.some((l) => l.slug === s))];
  const serialized = order.map((slug) => `${slug}:${picked[slug]}`).join(",");

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="lines" value={serialized} />
      {products.length === 0 && <span className="text-[0.8125rem] text-subtle">Aucun livre au catalogue.</span>}
      {products.map((p) => {
        const qty = picked[p.slug];
        return (
          <div key={p.slug} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${qty ? "bg-paper" : ""}`}>
            <input type="checkbox" checked={Boolean(qty)} onChange={() => toggle(p.slug)} aria-label={p.title} className="h-4 w-4 accent-black" />
            <Thumb src={p.image} tint={p.tint} size={36} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.8125rem] font-bold">{p.title}</span>
              <span className="text-[0.6875rem] text-subtle">{p.stock === null ? "stock non suivi" : `${p.stock} en stock de vente`}</span>
            </span>
            {qty ? (
              <input
                type="number"
                min={1}
                max={20}
                value={qty}
                onChange={(e) => setPicked((prev) => ({ ...prev, [p.slug]: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }))}
                aria-label={`Quantité · ${p.title}`}
                className="w-14 rounded-lg bg-white px-2 py-1.5 text-right text-[0.8125rem] font-extrabold outline-none"
              />
            ) : null}
          </div>
        );
      })}
      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        Ces exemplaires viennent du stock influenceurs : ils ne sont pas décomptés du stock de vente, et la commande créée
        vaut 0 € (jamais facturée).
      </span>
    </div>
  );
}
