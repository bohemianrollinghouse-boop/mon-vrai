"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Bandeau « déploiement en cours », en tête de l'admin.
 *
 * Le serveur qui répond est celui de l'ancienne version : il ne sait rien de la nouvelle
 * sans interroger App Hosting, d'où un sondage. Toutes les 15 s pendant un déploiement,
 * toutes les 60 s au repos, et rien du tout quand l'onglet est en arrière-plan — un
 * admin ouvert toute la journée ne doit pas marteler l'API pour rien.
 *
 * Quand un déploiement s'achève, le bandeau ne disparaît pas tout de suite : la page
 * ouverte tourne encore sur l'ancien code, et on propose de la recharger.
 */

type Status = { active: boolean; since?: number; what?: string; unknown?: boolean };

const FAST = 15_000;
const SLOW = 60_000;

export function DeployBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [finished, setFinished] = useState(false);
  const wasActive = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploiement", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Status;
      setStatus(next);
      if (wasActive.current && !next.active) setFinished(true);
      wasActive.current = next.active;
    } catch {
      // Réseau coupé, redémarrage en cours : on retentera au prochain tour.
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = async () => {
      if (document.visibilityState === "visible") await poll();
      if (stopped) return;
      timer = setTimeout(tick, wasActive.current ? FAST : SLOW);
    };
    void tick();

    // Revenir sur l'onglet doit donner l'état tout de suite, sans attendre le cycle.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  if (status?.active) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-tint-blue px-5 py-3 text-[0.8125rem] font-semibold text-tint-blue-ink">
        <Spinner />
        <span>
          <strong>Déploiement en cours…</strong> Une nouvelle version du site est en train d'être construite et mise en
          ligne. Rien à faire : cette page vous préviendra quand ce sera terminé.
        </span>
        {status.since && <Elapsed since={status.since} />}
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tint-green px-5 py-3 text-[0.8125rem] font-semibold text-tint-green-ink">
        <span>
          <strong>Nouvelle version en ligne.</strong> Cette page tourne encore sur l'ancienne : rechargez-la pour voir les
          changements.
        </span>
        <button type="button" onClick={() => window.location.reload()} className="rounded-pill bg-ink px-4 py-2 text-xs font-bold text-on-ink hover:opacity-80">
          Recharger
        </button>
      </div>
    );
  }

  return null;
}

function Spinner() {
  return (
    <span className="h-4 w-4 shrink-0 animate-spin rounded-pill border-2 border-current border-t-transparent" aria-hidden="true" />
  );
}

/* Durée écoulée, rafraîchie chaque seconde. L'horloge est lue dans un effet : un
   composant ne doit pas lire l'heure pendant son rendu (react-hooks/purity). */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // L'heure se lit dans un rappel, jamais dans le corps de l'effet ni au rendu :
    // `react-hooks` interdit les deux. D'où ce premier tour immédiat, à 0 ms.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now === null) return null;
  const s = Math.max(0, Math.round((now - since) / 1000));
  return <span className="ml-auto whitespace-nowrap tabular-nums opacity-70">{s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`}</span>;
}
