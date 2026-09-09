"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { completeCollectionAction } from "@/lib/cart/modal";
import { formatEuroShort } from "@/lib/domain/money";

/*
 * Bouton « Compléter la collection » du panier (fonctionnalité #3) : ajoute les titres
 * manquants pour obtenir la collection complète, puis rafraîchit le panier (la remise
 * « un livre offert » s'affiche alors dans le récapitulatif). Rendu seulement quand
 * l'offre collection est activée dans l'admin (côté page).
 */
export function CompleteCollectionButton({ missingCost }: { missingCost: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const complete = () =>
    startTransition(async () => {
      await completeCollectionAction();
      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={complete}
      disabled={pending}
      className="rounded-pill bg-ink px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
    >
      {pending ? "Ajout…" : `Compléter · +${formatEuroShort(missingCost)}`}
    </button>
  );
}
