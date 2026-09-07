"use client";

import { useActionState } from "react";
import { removeFromCartForm, setCartQtyForm, setPromoCode, type CartActionResult } from "@/lib/cart/actions";

/*
 * Contrôles du panier. Chaque bouton est un vrai formulaire vers une action serveur :
 * sans JavaScript, ils fonctionnent encore (avec rechargement) ; avec, la page se
 * rafraîchit dans la même réponse grâce à revalidatePath.
 */

const step = "flex h-[34px] w-[34px] items-center justify-center rounded-pill bg-white font-bold disabled:opacity-40";

export function QtyControls({ slug, qty, max = 50 }: { slug: string; qty: number; max?: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center rounded-pill bg-paper p-1">
        <form action={setCartQtyForm}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="qty" value={qty - 1} />
          <button type="submit" className={step} aria-label="Diminuer la quantité">
            −
          </button>
        </form>
        <span className="w-9 text-center text-sm font-bold" aria-live="polite">
          {qty}
        </span>
        <form action={setCartQtyForm}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="qty" value={qty + 1} />
          <button type="submit" className={step} disabled={qty >= max} aria-label="Augmenter la quantité">
            +
          </button>
        </form>
      </div>
      <form action={removeFromCartForm}>
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="border-b border-[#ccc] text-[0.8125rem] font-semibold text-subtle">
          Retirer
        </button>
      </form>
    </div>
  );
}

export function PromoForm({ current }: { current?: string }) {
  const [state, action, pending] = useActionState<CartActionResult | null, FormData>(
    async (_prev, formData) => setPromoCode(formData),
    null,
  );
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2 rounded-pill bg-paper p-1.5 pl-[1.125rem]">
      <label htmlFor="promo" className="sr-only-keep">
        Code promo
      </label>
      <input
        id="promo"
        name="code"
        type="text"
        defaultValue={current ?? ""}
        autoComplete="off"
        placeholder="Code promo"
        className="min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none"
      />
      <button type="submit" disabled={pending} className="flex-none rounded-pill bg-white px-4 py-2.5 text-xs font-bold disabled:opacity-60">
        {current ? "Modifier" : "Appliquer"}
      </button>
      {state && !state.ok && <span className="basis-full px-2 text-xs font-semibold text-danger">{state.error}</span>}
    </form>
  );
}
