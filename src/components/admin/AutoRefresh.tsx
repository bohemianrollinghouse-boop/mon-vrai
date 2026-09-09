"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redemande la page à intervalle régulier tant que l'onglet est visible (compteur « en ligne »). */
export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [everyMs, router]);
  return null;
}
