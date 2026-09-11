"use client";

import { useState } from "react";

/*
 * Commission d'un partenaire : facultative, et fermée par défaut. Tant qu'elle n'est
 * pas cochée, l'espace partenaire n'affiche aucun chiffre de commission et n'y fait
 * aucune allusion — d'où le repli du taux, qui évite de laisser croire qu'un taux
 * saisi suffit à l'activer.
 *
 * La case se poste en "true"/"false" (champ caché + case), comme ailleurs dans l'admin.
 */
export function CommissionField({ enabled, rate }: { enabled: boolean; rate: number }) {
  const [on, setOn] = useState(enabled);

  return (
    <div className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
      <input type="hidden" name="commission" value={on ? "true" : "false"} />
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-ink" />
        <span>Commission</span>
      </label>
      {on ? (
        <span className="flex items-center rounded-xl bg-paper px-3">
          <input
            name="rate"
            type="number"
            min={0}
            max={100}
            defaultValue={rate}
            className="min-w-0 flex-1 bg-transparent py-3 text-[0.8125rem] font-bold text-ink outline-none"
          />
          <span className="whitespace-nowrap text-xs font-bold text-ink">% du CA HT</span>
        </span>
      ) : (
        <>
          <input type="hidden" name="rate" value={rate} />
          <span className="rounded-xl bg-paper px-3 py-3 text-[0.6875rem] leading-relaxed text-subtle">
            Aucune commission. Son espace n'en montrera rien et n'en fera pas mention.
          </span>
        </>
      )}
    </div>
  );
}
