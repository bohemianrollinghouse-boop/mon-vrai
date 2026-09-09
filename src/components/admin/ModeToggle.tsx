"use client";

import { setSiteModeAction } from "@/lib/admin/actions/settings";

/*
 * Slider prod/test global, en haut de l'admin. Il agit sur les deux services à la fois
 * (Stripe + Boxtal). L'état « Partiel » apparaît tout seul quand les deux ne sont pas au
 * même mode (ex. Stripe en test, Boxtal en production) : il n'est pas cliquable, il se
 * règle service par service dans Paramètres. Fonctionne sans JavaScript.
 */
export function ModeToggle({ stripe, boxtal }: { stripe: "live" | "test"; boxtal: "live" | "test" }) {
  const state: "live" | "test" | "partial" = stripe === boxtal ? stripe : "partial";
  return (
    <div className="flex items-center gap-1 rounded-pill bg-paper p-1" role="group" aria-label="Mode du site">
      <Seg target="live" active={state === "live"} label="Production" activeClass="bg-ink text-white" confirm="Repasser Stripe ET Boxtal en PRODUCTION ? Les paiements et étiquettes redeviennent réels." />
      <span
        aria-current={state === "partial" ? "true" : undefined}
        title="Stripe et Boxtal ne sont pas au même mode. Se règle service par service dans Paramètres."
        className={`rounded-pill px-3 py-1.5 text-[0.6875rem] font-bold ${state === "partial" ? "bg-tint-sand text-tint-sand-ink" : "text-faint"}`}
      >
        Partiel
      </span>
      <Seg target="test" active={state === "test"} label="Test" activeClass="bg-tint-sand text-tint-sand-ink" confirm="Passer Stripe ET Boxtal en mode TEST ? Bacs à sable : aucun paiement ni étiquette réels." />
    </div>
  );
}

function Seg({ target, active, label, activeClass, confirm }: { target: "live" | "test"; active: boolean; label: string; activeClass: string; confirm: string }) {
  if (active) {
    return (
      <span aria-current="true" className={`rounded-pill px-3 py-1.5 text-[0.6875rem] font-bold ${activeClass}`}>
        {label}
      </span>
    );
  }
  return (
    <form
      action={setSiteModeAction}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="mode" value={target} />
      <input type="hidden" name="service" value="both" />
      <button type="submit" className="rounded-pill px-3 py-1.5 text-[0.6875rem] font-bold text-subtle transition-colors hover:text-ink">
        {label}
      </button>
    </form>
  );
}
