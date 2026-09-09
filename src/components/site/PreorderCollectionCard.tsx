"use client";

import { useTransition } from "react";
import { completeCollectionAction } from "@/lib/cart/modal";
import { formatEuroShort } from "@/lib/domain/money";
import { useCartModal } from "./CartModal";

/*
 * Encart « Précommander la collection » en tête du catalogue (fonctionnalité #2). N'est
 * rendu que si l'offre collection est activée dans l'admin. Le bouton ajoute tous les
 * titres publiés au panier d'un coup, puis ouvre la modal « Ajouté au panier ».
 */
export function PreorderCollectionCard({ totalTitles, fullPrice, offerPrice }: { totalTitles: number; fullPrice: number; offerPrice: number }) {
  const { openCartModal } = useCartModal();
  const [pending, startTransition] = useTransition();

  const preorder = () =>
    startTransition(async () => {
      await completeCollectionAction();
      openCartModal();
    });

  return (
    <div className="site-wrap pt-6">
      <div className="grid grid-cols-[1.4fr_auto] items-center gap-8 rounded-panel bg-tint-sand px-10 py-8 max-[749px]:grid-cols-1 max-[749px]:gap-5 max-[749px]:px-7 max-[749px]:py-7">
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow text-tint-sand-ink">La collection complète</span>
          <h2 className="display-2 text-[clamp(1.5rem,3vw,2.25rem)]">Précommandez les {totalTitles} imagiers, un livre offert</h2>
          <p className="text-[0.9375rem] font-semibold leading-relaxed text-tint-sand-ink">
            Les {totalTitles} imagiers pour <strong>{formatEuroShort(offerPrice)}</strong> <span className="line-through opacity-60">{formatEuroShort(fullPrice)}</span> · un seul colis, expédié dès le 25 décembre.
          </p>
        </div>
        <button
          type="button"
          onClick={preorder}
          disabled={pending}
          className="rounded-pill bg-ink px-8 py-[1.125rem] text-center text-sm font-bold text-white disabled:opacity-50 max-[749px]:w-full"
        >
          {pending ? "Ajout…" : "Précommander la collection"}
        </button>
      </div>
    </div>
  );
}
