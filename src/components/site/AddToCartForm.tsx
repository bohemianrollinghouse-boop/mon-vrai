"use client";

import { useActionState, useState } from "react";
import { addToCart, type CartActionResult } from "@/lib/cart/actions";
import { formatEuroShort } from "@/lib/domain/money";
import { useCartModal } from "./CartModal";

/*
 * Bloc d'achat de la fiche produit (maquette 9a) : compteur − n + et bouton dont le
 * libellé porte le total. L'action serveur fait tout ; le composant client n'existe que
 * pour le compteur et la confirmation sans quitter la page.
 */
export function AddToCartForm({ slug, verb, unitPrice, disabled = false, note }: { slug: string; verb: string; unitPrice: number; disabled?: boolean; note?: string }) {
  const [qty, setQty] = useState(1);
  const { openCartModal } = useCartModal();
  const [state, action, pending] = useActionState<CartActionResult | null, FormData>(async (_prev, formData) => {
    const result = await addToCart(formData);
    if (result.ok) openCartModal({ slug });
    return result;
  }, null);

  return (
    <form action={action} className="flex flex-col gap-3.5 rounded-card bg-white p-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="qty" value={qty} />
      <div className="flex items-center gap-3 max-[479px]:flex-col max-[479px]:items-stretch">
        <div className="flex items-center rounded-pill bg-paper p-1" role="group" aria-label="Quantité">
          <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Moins" className="flex h-10 w-10 items-center justify-center rounded-pill bg-white text-base font-bold">
            −
          </button>
          <span className="w-10 text-center text-[0.9375rem] font-bold" aria-live="polite">
            {qty}
          </span>
          <button type="button" onClick={() => setQty(Math.min(20, qty + 1))} aria-label="Plus" className="flex h-10 w-10 items-center justify-center rounded-pill bg-white text-base font-bold">
            +
          </button>
        </div>
        <button type="submit" disabled={disabled || pending} className="flex-1 rounded-pill bg-ink px-6 py-[1.125rem] text-center text-sm font-bold text-white disabled:opacity-50">
          {pending ? "Ajout…" : disabled ? "Épuisé" : `${verb} · ${formatEuroShort(unitPrice * qty)}${state?.ok ? ` (${state.count} dans le panier)` : ""}`}
        </button>
      </div>
      {note && (
        <span className="flex items-center gap-2.5 text-[0.8125rem] font-semibold text-tint-green-ink">
          <span className="h-2 w-2 rounded-pill bg-tint-green-ink" aria-hidden="true" />
          {note}
        </span>
      )}
      {state?.ok && (
        <p role="status" className="text-sm font-semibold text-tint-green-ink">
          Ajouté au panier · {state.count} dans le panier
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
