"use client";

import { useState, useTransition } from "react";
import type { PartnerResult } from "@/lib/auth/partner-actions";

/*
 * La fin d'une collaboration, dite au partenaire.
 *
 * Sans ce bloc, clore une campagne ne se voyait nulle part de son côté : son code
 * cessait de remiser, son kit disparaissait de son parcours, et rien ne lui disait
 * pourquoi — il pouvait croire à une panne. On le lui dit donc, avec la date, et on lui
 * laisse le seul geste qui ait du sens ensuite : redemander.
 *
 * Demander n'engage que nous à répondre. Le bouton disparaît une fois la demande faite
 * — il n'y a rien à redemander deux fois — et reparaîtra tout seul à la fin de la
 * campagne suivante, puisque la demande ne vaut que pour la campagne qui vient de
 * s'achever (voir promos/renewal.ts).
 */
export function CampaignOver({
  name,
  endedOn,
  codeUntil,
  asked,
  askedOn,
  action,
}: {
  name: string;
  endedOn: string;
  /** Jusqu'à quand son code remise encore ; vide s'il n'en avait pas, ou plus. */
  codeUntil: string;
  asked: boolean;
  askedOn: string;
  action: () => Promise<PartnerResult>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(asked);
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      const result = await action();
      setNotice(result.ok ? result.message : result.error);
      if (result.ok) setSent(true);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-panel bg-tint-sand px-9 py-7 max-[749px]:px-6 max-[749px]:py-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-tint-sand-ink">Campagne terminée</span>
        <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">
          {name} s&apos;est achevée le {endedOn}.
        </h2>
        <p className="max-w-[46rem] text-[0.8125rem] font-medium leading-relaxed text-tint-sand-ink">
          Merci pour tout ce que vous y avez mis. Il n&apos;y a plus de kit à commander, mais votre lien continue de
          vous attribuer les ventes et tout votre historique reste ici.
          {codeUntil ? ` Votre code, lui, remise jusqu'au ${codeUntil} comme annoncé.` : ""}
          {sent ? " Nous avons bien reçu votre envie de repartir." : " Envie de repartir pour une nouvelle ?"}
        </p>
        {sent && askedOn && <span className="text-xs font-semibold text-tint-sand-ink">Demande envoyée le {askedOn}.</span>}
        {notice && <span className="text-xs font-semibold text-tint-sand-ink">{notice}</span>}
      </div>

      {sent ? (
        <span className="whitespace-nowrap rounded-pill bg-white px-5 py-3 text-[0.8125rem] font-bold">Demande envoyée</span>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={pending}
          className="whitespace-nowrap rounded-pill bg-ink px-5 py-3 text-[0.8125rem] font-bold text-white hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "…" : "Je veux une nouvelle campagne"}
        </button>
      )}
    </div>
  );
}
