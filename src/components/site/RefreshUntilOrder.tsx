"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/*
 * Page de merci : la commande est créée par le webhook, parfois une ou deux secondes
 * après le retour du client. Tant qu'elle n'est pas là, on redemande la page à
 * intervalle court, quelques fois - puis on laisse le message d'attente.
 */
export function RefreshUntilOrder({ found, attempts = 6 }: { found: boolean; attempts?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (found) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= attempts) clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [found, attempts, router]);
  return null;
}
