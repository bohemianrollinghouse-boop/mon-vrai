"use client";

import { useState } from "react";
import type { PromoType } from "@/lib/domain/types";
import { TINT_BG } from "@/components/site/ui";

/*
 * Éditeur d'un code promo : le type choisi montre ses champs — valeur et minimum pour
 * une remise, la liste des produits à offrir pour un cadeau. Les champs restent de vrais
 * champs de formulaire, lus par l'action serveur.
 */

const TYPES: { value: PromoType; label: string }[] = [
  { value: "percent", label: "Pourcentage" },
  { value: "fixed", label: "Montant" },
  { value: "free_shipping", label: "Livraison" },
  { value: "gift", label: "Cadeau" },
];

type ProductOpt = { slug: string; title: string; image?: string; tint: keyof typeof TINT_BG };

export function PromoTypeFields({ initialType, initialValue, initialMinimum, initialGifts, initialFreeShipping = false, products }: { initialType: PromoType; initialValue: string; initialMinimum: string; initialGifts: string[]; initialFreeShipping?: boolean; products: ProductOpt[] }) {
  const [type, setType] = useState<PromoType>(initialType);
  const [gifts, setGifts] = useState<string[]>(initialGifts);
  const [freeShipping, setFreeShipping] = useState<boolean>(initialFreeShipping);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-subtle">Type de remise</span>
        <div className="flex gap-1 rounded-pill bg-paper p-1 text-[0.6875rem] font-bold" role="radiogroup">
          {TYPES.map((t) => (
            <label key={t.value} className="flex-1 cursor-pointer">
              <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="peer sr-only" />
              <span className="flex h-[34px] items-center justify-center whitespace-nowrap rounded-pill px-1 peer-checked:bg-ink peer-checked:text-on-ink peer-focus-visible:outline-2 peer-focus-visible:outline-ink">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {(type === "percent" || type === "fixed") && (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
            <span>Valeur</span>
            <span className="flex items-center rounded-xl bg-paper px-3">
              <input name="value" defaultValue={initialValue} inputMode="decimal" required className="min-w-0 flex-1 bg-transparent py-3 text-sm font-extrabold text-ink outline-none" />
              <span className="text-[0.8125rem] font-extrabold text-ink">{type === "percent" ? "%" : "€"}</span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
            <span>Panier minimum</span>
            <span className="flex items-center rounded-xl bg-paper px-3">
              <input name="minimumEuros" defaultValue={initialMinimum} inputMode="decimal" placeholder="0" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-ink outline-none placeholder:text-faint" />
              <span className="text-[0.8125rem] font-extrabold text-ink">€</span>
            </span>
          </label>
        </div>
      )}

      {type === "free_shipping" && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
          <span>Panier minimum</span>
          <span className="flex items-center rounded-xl bg-paper px-3">
            <input name="minimumEuros" defaultValue={initialMinimum} inputMode="decimal" placeholder="0" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-ink outline-none placeholder:text-faint" />
            <span className="text-[0.8125rem] font-extrabold text-ink">€</span>
          </span>
        </label>
      )}

      {type === "gift" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-subtle">Produit(s) offert(s)</span>
            <span className="text-[0.6875rem] font-bold text-muted">{gifts.length ? `${gifts.length} sélectionné${gifts.length > 1 ? "s" : ""}` : "Aucun"}</span>
          </div>
          <div className="grid max-h-[210px] grid-cols-2 gap-1.5 overflow-auto">
            {products.map((p) => {
              const on = gifts.includes(p.slug);
              return (
                <label key={p.slug} className={`flex cursor-pointer items-center gap-2 rounded-xl border-[1.5px] bg-paper px-2.5 py-2 ${on ? "border-ink" : "border-transparent"}`}>
                  <input type="checkbox" name="gifts" value={p.slug} checked={on} onChange={(e) => setGifts(e.target.checked ? [...gifts, p.slug] : gifts.filter((s) => s !== p.slug))} className="sr-only" />
                  <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink text-[0.625rem] font-extrabold text-on-ink ${on ? "bg-ink" : "bg-transparent"}`}>{on ? "✓" : ""}</span>
                  <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] ${TINT_BG[p.tint]}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- vignette admin */}
                    {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 truncate text-[0.6875rem] font-bold leading-tight">{p.title}</span>
                </label>
              );
            })}
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
            <span>Panier minimum</span>
            <span className="flex items-center rounded-xl bg-paper px-3">
              <input name="minimumEuros" defaultValue={initialMinimum} inputMode="decimal" placeholder="0" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-ink outline-none placeholder:text-faint" />
              <span className="text-[0.8125rem] font-extrabold text-ink">€</span>
            </span>
          </label>
          <span className="text-[0.6875rem] leading-relaxed text-subtle">Les produits cochés sont ajoutés au panier à 0 € (1 ex. chacun), dans la limite du stock.</span>
        </div>
      )}

      {/* Frais de livraison offerts : proposé pour tous les types sauf « Livraison » (redondant). */}
      {type !== "free_shipping" && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-paper px-3 py-3">
          <input type="checkbox" name="freeShipping" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} className="sr-only" />
          <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink text-[0.625rem] font-extrabold text-on-ink ${freeShipping ? "bg-ink" : "bg-transparent"}`}>{freeShipping ? "✓" : ""}</span>
          <span className="flex flex-col">
            <span className="text-[0.8125rem] font-bold text-ink">Offrir aussi les frais de livraison</span>
            <span className="text-[0.6875rem] text-subtle">En plus de la remise ci-dessus.</span>
          </span>
        </label>
      )}
    </div>
  );
}
