"use client";

import { useTransition } from "react";
import { useCartModal } from "@/components/site/CartModal";
import { completeCollectionAction } from "@/lib/cart/modal";

/*
 * Bouton de l'encart « collection complète » du catalogue : ajoute d'un coup tous les
 * imagiers manquants au panier, puis ouvre la modal « Ajouté au panier ». On réutilise
 * l'encart éditable existant (contenu admin) ; ce bouton ne fait que remplacer son lien.
 */
export function CollectionOfferButton({ label }: { label: string }) {
  const { openCartModal } = useCartModal();
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      await completeCollectionAction();
      openCartModal();
    });
  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      className="rounded-pill bg-ink px-6 py-3.5 text-center text-[0.8125rem] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Ajout…" : label}
    </button>
  );
}
