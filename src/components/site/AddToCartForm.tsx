"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addToCart, type CartActionResult } from "@/lib/cart/actions";

/*
 * Bouton d'ajout au panier de la fiche produit. L'action serveur fait tout ; le
 * composant client n'existe que pour montrer la confirmation sans quitter la page.
 */
export function AddToCartForm({ slug, label, disabled = false }: { slug: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<CartActionResult | null, FormData>(
    async (_prev, formData) => addToCart(formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center rounded-pill bg-white p-1">
          <span className="sr-only-keep">Quantité</span>
          <select name="qty" defaultValue="1" className="cursor-pointer appearance-none rounded-pill bg-transparent py-2.5 pr-6 pl-4 text-sm font-bold">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={disabled || pending}
          className="rounded-pill bg-ink px-[1.875rem] py-[1.125rem] text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "Ajout…" : label}
        </button>
      </div>

      {state?.ok && (
        <p role="status" className="text-sm font-semibold text-tint-green-ink">
          Ajouté au panier ·{" "}
          <Link href="/panier" className="underline">
            voir le panier ({state.count})
          </Link>
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
