"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Balise de fréquentation, sans cookie (stockage local seulement) : à chaque page affichée, un « view » vers
 * /api/stats/hit ; tant que l'onglet est visible, un « ping » toutes les 30 s pour le
 * compteur « en ligne ». L'identifiant de session vit dans sessionStorage (propre à
 * l'onglet, disparaît à sa fermeture) et ne sert qu'à dédupliquer la présence et à savoir
 * quelle page est la première de la visite (référent, utm_source et appareil ne sont
 * relevés que là).
 * Pas d'admin, pas de navigateur piloté (tests, robots).
 */

const KEY = "mv_sid";
const PING_MS = 30_000;

function session(): { sid: string; first: boolean } {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return { sid: existing, first: false };
    const sid = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    sessionStorage.setItem(KEY, sid);
    return { sid, first: true };
  } catch {
    return { sid: Math.random().toString(36).slice(2, 14).padEnd(12, "0"), first: false };
  }
}

/** Identifiant visiteur du jour (heure de Paris) : tiré au sort, renouvelé chaque jour, jamais envoyé ailleurs. */
function visitorId(): string | undefined {
  try {
    const day = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const raw = localStorage.getItem("mv_vid");
    const cur = raw ? (JSON.parse(raw) as { id?: string; day?: string }) : null;
    if (cur?.id && cur.day === day) return cur.id;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    localStorage.setItem("mv_vid", JSON.stringify({ id, day }));
    return id;
  } catch {
    return undefined;
  }
}

function send(payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/stats/hit", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // sendBeacon indisponible ou refusé : on passe par fetch.
  }
  fetch("/api/stats/hit", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export function StatsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || navigator.webdriver) return;
    const { sid, first } = session();
    const utm = first ? new URLSearchParams(window.location.search).get("utm_source") ?? "" : "";
    // Le navigateur est envoyé dans le corps : l'en-tête User-Agent n'atteint pas le serveur
    // tel quel derrière App Hosting.
    send({ t: "view", p: pathname, r: first ? document.referrer : "", u: utm, s: sid, f: first, ua: navigator.userAgent, v: visitorId() });
    const ping = () => {
      if (document.visibilityState === "visible") send({ t: "ping", p: pathname, s: sid });
    };
    const id = setInterval(ping, PING_MS);
    return () => clearInterval(id);
  }, [pathname]);

  return null;
}
