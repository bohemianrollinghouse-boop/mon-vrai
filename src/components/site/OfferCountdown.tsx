"use client";

import { useEffect, useState } from "react";

/*
 * Compte à rebours du dernier jour de l'offre collection : heures, minutes, secondes
 * jusqu'à minuit (heure de Paris), l'instant précis où l'offre s'éteint.
 *
 * Deux valeurs plutôt qu'une : `endsAt` (le terme) et `remaining` (ce qu'il en restait
 * au rendu serveur). Le premier rendu du navigateur repart de `remaining` et reproduit
 * donc exactement le HTML reçu — sans quoi la seconde écoulée entre le serveur et
 * l'hydratation ferait un écart. Le temps réel ne reprend la main qu'au premier tic.
 */
export function OfferCountdown({ endsAt, remaining }: { endsAt: number; remaining: number }) {
  const [left, setLeft] = useState(remaining);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, endsAt - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  const total = Math.floor(Math.max(0, left) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex gap-2.5 max-[599px]:w-full" role="timer" aria-label="Temps restant pour profiter de l'offre">
      <Tile value={pad(Math.floor(total / 3600))} label="heures" />
      <Tile value={pad(Math.floor((total % 3600) / 60))} label="minutes" />
      <Tile value={pad(total % 60)} label="secondes" />
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-[84px] flex-1 flex-col items-center rounded-card bg-white px-5 py-[1.125rem] max-[599px]:min-w-0">
      {/* `tabular-nums` : les chiffres gardent la même largeur, les tuiles ne sautillent pas. */}
      <span className="text-[2.5rem] font-extrabold leading-none tabular-nums max-[599px]:text-[2rem]">{value}</span>
      <span className="text-xs font-bold text-tint-blue-ink">{label}</span>
    </div>
  );
}
