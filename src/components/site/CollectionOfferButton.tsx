"use client";

import { useTransition } from "react";
import { useCartModal } from "@/components/site/CartModal";
import { completeCollectionAction } from "@/lib/cart/modal";

/*
 * Bouton de l'encart « collection complète » du catalogue : ajoute d'un coup tous les
 * imagiers manquants au panier, puis ouvre la modal « Ajouté au panier ». On réutilise
 * l'encart éditable existant (contenu admin) ; ce bouton ne fait que remplacer son lien.
 */
/*
 * Deux tailles, et pas un `className` libre : deux classes de padding concurrentes dans
 * la même chaîne Tailwind se départagent par l'ordre de la feuille, pas par l'ordre
 * d'écriture — l'appelant croirait régler ce qu'il ne règle pas.
 */
const SHAPE = {
  /** L'encart « collection complète » du héro du catalogue. */
  encart: "px-6 py-3.5 text-[0.8125rem]",
  /** Le bouton principal du héro « dernier jour » de l'accueil. */
  hero: "px-8 py-[1.125rem] text-sm max-[599px]:w-full",
};

export function CollectionOfferButton({ label, shape = "encart" }: { label: string; shape?: keyof typeof SHAPE }) {
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
      className={`rounded-pill bg-ink text-center font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${SHAPE[shape]}`}
    >
      {pending ? "Ajout…" : label}
    </button>
  );
}
