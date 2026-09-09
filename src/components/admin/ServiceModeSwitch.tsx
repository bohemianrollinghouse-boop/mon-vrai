"use client";

import { useTransition } from "react";
import { setSiteModeAction } from "@/lib/admin/actions/settings";

/*
 * Interrupteur de mode pour un seul service (Stripe ou Boxtal), dans les Paramètres.
 * Permet un état « partiel » (ex. Stripe en test, Boxtal en production). Appelle l'action
 * directement (bouton, pas de <form>) pour pouvoir vivre à l'intérieur du grand formulaire
 * de réglages sans l'imbriquer.
 */
export function ServiceModeSwitch({ service, mode, label }: { service: "stripe" | "boxtal"; mode: "live" | "test"; label: string }) {
  const [pending, start] = useTransition();
  const test = mode === "test";
  const target = test ? "live" : "test";

  const toggle = () => {
    const msg =
      target === "test"
        ? `Passer ${label} en mode TEST ?`
        : `Repasser ${label} en PRODUCTION ?`;
    if (!window.confirm(msg)) return;
    const fd = new FormData();
    fd.set("service", service);
    fd.set("mode", target);
    start(() => {
      void setSiteModeAction(fd);
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-paper px-4 py-3 text-[0.8125rem]">
      <div className="flex flex-col">
        <span className="font-bold">{label}</span>
        <span className="text-xs text-subtle">{test ? "Bac à sable (test)" : "Production"}</span>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={test}
        className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors disabled:opacity-50 ${test ? "bg-tint-sand-ink" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white transition-all ${test ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
