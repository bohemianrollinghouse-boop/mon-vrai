"use client";

import { setSiteModeAction } from "@/lib/admin/actions/settings";

/*
 * Slider prod/test global, en haut de l'admin. Bascule tout le site : Stripe (clés
 * test/live) et Boxtal (étiquettes en bac à sable) suivent ce réglage. Le côté actif
 * n'est pas cliquable ; passer de l'autre côté demande confirmation (c'est un changement
 * qui touche de vrais paiements). Fonctionne sans JavaScript (deux vrais formulaires).
 */
export function ModeToggle({ mode }: { mode: "live" | "test" }) {
  const test = mode === "test";
  return (
    <div className="flex items-center gap-1 rounded-pill bg-paper p-1" role="group" aria-label="Mode du site">
      <Seg target="live" active={!test} label="Production" activeClass="bg-ink text-white" confirm="Repasser tout le site en PRODUCTION ? Les paiements réels seront de nouveau acceptés." />
      <Seg target="test" active={test} label="Test" activeClass="bg-tint-sand text-tint-sand-ink" confirm="Passer tout le site en mode TEST ? Stripe et Boxtal basculent en bac à sable : aucun paiement ni étiquette réels." />
    </div>
  );
}

function Seg({ target, active, label, activeClass, confirm }: { target: "live" | "test"; active: boolean; label: string; activeClass: string; confirm: string }) {
  if (active) {
    return (
      <span aria-current="true" className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[0.6875rem] font-bold ${activeClass}`}>
        {target === "test" && <span className="h-1.5 w-1.5 rounded-pill bg-tint-sand-ink" aria-hidden="true" />}
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
      <button type="submit" className="rounded-pill px-3 py-1.5 text-[0.6875rem] font-bold text-subtle transition-colors hover:text-ink">
        {label}
      </button>
    </form>
  );
}
