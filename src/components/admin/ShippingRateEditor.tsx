"use client";

import { useState } from "react";
import type { ShippingRate } from "@/lib/domain/types";
import { BOXTAL_OFFERS } from "@/lib/boxtal/offers";
import { COUNTRY_LABELS, SHIPPING_COUNTRIES, SUPPLIER_COST_TTC, WEIGHT_BRACKETS, type ShippingCountry } from "@/lib/shipping/tariffs";
import { formatEuro } from "@/lib/domain/money";

/*
 * Éditeur d'un mode de livraison, dans le grand formulaire des réglages. Le prix facturé
 * au client dépend de la tranche de poids ET du pays (FR, BE, LU) : deux menus déroulants
 * choisissent la case à éditer, et le coût réel payé chez Boxtal (TTC) est affiché en
 * repère. Tous les prix (3 pays × N tranches) sont postés en champs cachés ; l'offre
 * Boxtal se règle par pays (Chrono 13 en France, Chrono Classic vers BE/LU).
 */

const eurosStr = (cents?: number) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

function initRow(cents: number[] | undefined): string[] {
  return WEIGHT_BRACKETS.map((_, b) => eurosStr(cents?.[b]));
}

export function ShippingRateEditor({ index, rate, freeThreshold }: { index: number; rate: ShippingRate; freeThreshold: number }) {
  const base = `shipping.rates[${index}]`;
  const [country, setCountry] = useState<ShippingCountry>("FR");
  const [bracket, setBracket] = useState(0);
  const [prices, setPrices] = useState<Record<ShippingCountry, string[]>>({
    FR: initRow(rate.prices.FR),
    BE: initRow(rate.prices.BE),
    LU: initRow(rate.prices.LU),
  });

  const setCell = (value: string) => setPrices((p) => ({ ...p, [country]: p[country].map((v, b) => (b === bracket ? value : v)) }));

  const costRow = SUPPLIER_COST_TTC[rate.id]?.[country];
  const costCents = costRow?.[bracket];
  const selectCls = "rounded-lg bg-white px-2.5 py-1.5 text-[0.8125rem] font-semibold outline-none";

  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-paper px-4 py-3.5">
      <input type="hidden" name={`${base}.id`} value={rate.id} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input name={`${base}.name`} defaultValue={rate.name} placeholder="Nom" className="w-full bg-transparent font-bold outline-none placeholder:font-medium placeholder:text-faint" />
          <input name={`${base}.description`} defaultValue={rate.description} placeholder="Délai, ex. 2 à 3 jours" className="w-full bg-transparent text-xs text-subtle outline-none placeholder:text-faint" />
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">
          <input type="hidden" name={`${base}.enabled`} value="false" />
          <input type="checkbox" name={`${base}.enabled`} value="true" defaultChecked={rate.enabled} className="h-3.5 w-3.5 accent-ink" />
          Proposé
        </label>
      </div>

      {/* Offre Boxtal par pays : sert à créer l'étiquette. */}
      <div className="grid grid-cols-3 gap-2 max-[599px]:grid-cols-1">
        {SHIPPING_COUNTRIES.map((c) => (
          <label key={c} className="flex flex-col gap-0.5">
            <span className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-faint">Offre Boxtal · {c}</span>
            <select name={`${base}.offerCodes.${c}`} defaultValue={rate.offerCodes[c]} className={selectCls} aria-label={`Offre Boxtal ${COUNTRY_LABELS[c]}`}>
              <option value="">Sans Boxtal (suivi manuel)</option>
              {BOXTAL_OFFERS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                  {o.relay ? " · relais" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* Prix client par tranche de poids et par pays. */}
      <div className="flex flex-wrap items-end gap-2.5 rounded-lg bg-white px-3 py-2.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-faint">Pays</span>
          <select value={country} onChange={(e) => setCountry(e.target.value as ShippingCountry)} className={selectCls}>
            {SHIPPING_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-faint">Tranche de poids</span>
          <select value={bracket} onChange={(e) => setBracket(Number(e.target.value))} className={selectCls}>
            {WEIGHT_BRACKETS.map((b, i) => (
              <option key={b.maxG} value={i}>
                {b.label}
                {SUPPLIER_COST_TTC[rate.id]?.[country]?.[i] != null ? ` · Boxtal ${formatEuro(SUPPLIER_COST_TTC[rate.id][country][i])}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-faint">Prix client</span>
          <span className="flex items-center gap-1 rounded-lg bg-paper px-2.5 py-1.5 font-extrabold">
            <input value={prices[country][bracket] ?? ""} onChange={(e) => setCell(e.target.value)} placeholder="0,00" inputMode="decimal" className="w-16 bg-transparent text-right outline-none placeholder:font-medium placeholder:text-faint" />
            €
          </span>
        </label>
        <span className="pb-1.5 text-[0.6875rem] font-semibold text-subtle">
          Coût Boxtal (TTC) : <strong className="text-ink">{costCents != null ? formatEuro(costCents) : "—"}</strong>
          {costCents != null && prices[country][bracket] ? <span className="text-faint"> · c'est ton coût réel, saisis un prix au-dessus</span> : null}
        </span>
      </div>

      <label className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-subtle">
        <input type="hidden" name={`${base}.freeAboveThreshold`} value="false" />
        <input type="checkbox" name={`${base}.freeAboveThreshold`} value="true" defaultChecked={rate.freeAboveThreshold} className="h-3.5 w-3.5 accent-ink" />
        Offert dès {freeThreshold ? formatEuro(freeThreshold) : "le seuil"} d'achat
      </label>

      {/* Tous les prix postés, y compris les cases non affichées. */}
      {SHIPPING_COUNTRIES.map((c) => prices[c].map((v, b) => <input key={`${c}-${b}`} type="hidden" name={`${base}.prices.${c}[${b}]`} value={v} />))}
    </div>
  );
}
