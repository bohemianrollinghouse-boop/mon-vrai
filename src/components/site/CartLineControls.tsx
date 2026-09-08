"use client";

import { useActionState } from "react";
import { addPromoCode, removeFromCartForm, removePromoCodeForm, setCartQtyForm, type CartActionResult } from "@/lib/cart/actions";

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

export type AppliedCode = { code: string; label: string; viaLink?: boolean };

/** Codes promo : saisie d'un code, et la liste des codes appliqués avec retrait. */
export function PromoForm({ applied = [], errors = [] }: { applied?: AppliedCode[]; errors?: { code: string; reason: string }[] }) {
  const [state, action, pending] = useActionState<CartActionResult | null, FormData>(async (_prev, formData) => addPromoCode(formData), null);
  return (
    <div className="flex flex-col gap-2">
      {applied.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {applied.map((a) => (
            <li key={a.code} className="flex items-center gap-1.5 rounded-pill bg-tint-green py-1.5 pl-3 pr-1.5 text-xs font-bold text-tint-green-ink">
              {a.code} · {a.label}
              {a.viaLink ? (
                <span className="rounded-pill bg-white/70 px-2 py-0.5 text-[0.625rem] font-bold">via lien</span>
              ) : (
                <form action={removePromoCodeForm}>
                  <input type="hidden" name="code" value={a.code} />
                  <button type="submit" aria-label={`Retirer le code ${a.code}`} className="flex h-5 w-5 items-center justify-center rounded-pill bg-white/70 text-[0.6875rem] hover:bg-white">
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap items-center gap-2 rounded-pill bg-paper p-1.5 pl-[1.125rem]">
        <label htmlFor="promo" className="sr-only-keep">
          Code promo
        </label>
        <input id="promo" name="code" type="text" autoComplete="off" placeholder={applied.length ? "Un autre code ?" : "Code promo"} className="min-w-0 flex-1 bg-transparent text-[0.8125rem] uppercase outline-none" />
        <button type="submit" disabled={pending} className="flex-none rounded-pill bg-white px-4 py-2.5 text-xs font-bold disabled:opacity-60">
          Appliquer
        </button>
        {state && !state.ok && <span className="basis-full px-2 text-xs font-semibold text-danger">{state.error}</span>}
      </form>
      {errors.map((e) => (
        <p key={e.code} className="px-2 text-xs font-semibold text-danger">
          {e.code} : {e.reason}
        </p>
      ))}
    </div>
  );
}
