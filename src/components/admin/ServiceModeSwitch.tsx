"use client";

import { useTransition } from "react";
import { setSiteModeAction } from "@/lib/admin/actions/settings";

/*
 * Slider de mode pour un seul service (Stripe ou Boxtal), avec « Production » d'un côté et
 * « Test » de l'autre, le côté actif mis en valeur. Permet un état « partiel » (ex. Stripe
 * en test, Boxtal en production). Confirmation au changement (ça touche de vrais paiements
 * ou étiquettes). Appelle l'action directement pour vivre dans le grand formulaire.
 */
export function ServiceModeSwitch({ service, mode, label }: { service: "stripe" | "boxtal"; mode: "live" | "test"; label: string }) {
  const [pending, start] = useTransition();

  const go = (target: "live" | "test") => {
    if (target === mode) return;
    const msg = target === "test" ? `Passer ${label} en mode TEST ?` : `Repasser ${label} en PRODUCTION ?`;
    if (!window.confirm(msg)) return;
    const fd = new FormData();
    fd.set("service", service);
    fd.set("mode", target);
    start(() => {
      void setSiteModeAction(fd);
    });
  };

  const seg = "flex-1 rounded-pill px-3 py-1.5 text-center text-[0.6875rem] font-bold transition-colors disabled:opacity-60";
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-paper px-4 py-3">
      <span className="text-[0.8125rem] font-bold">{label}</span>
      <div className="flex w-[190px] shrink-0 rounded-pill bg-white p-1" role="group" aria-label={`Mode ${label}`}>
        <button type="button" onClick={() => go("live")} disabled={pending} aria-pressed={mode === "live"} className={`${seg} ${mode === "live" ? "bg-ink text-white" : "text-subtle hover:text-ink"}`}>
          Production
        </button>
        <button type="button" onClick={() => go("test")} disabled={pending} aria-pressed={mode === "test"} className={`${seg} ${mode === "test" ? "bg-tint-sand-ink text-white" : "text-subtle hover:text-ink"}`}>
          Test
        </button>
      </div>
    </div>
  );
}
