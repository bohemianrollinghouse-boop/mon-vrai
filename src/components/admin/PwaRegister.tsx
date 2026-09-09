"use client";

import { useEffect } from "react";

/*
 * Enregistre le service worker de l'admin (scopé /admin/). Il rend l'admin installable
 * (PWA) et reçoit les notifications push. Silencieux : si le navigateur ne supporte pas
 * les service workers, on ne fait rien.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/admin/service-worker", { scope: "/admin/" }).catch(() => {});
  }, []);
  return null;
}
