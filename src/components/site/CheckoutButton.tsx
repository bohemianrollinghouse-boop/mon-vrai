"use client";

import { useActionState } from "react";
import { startCheckout, type CheckoutResult } from "@/lib/checkout/actions";

/** Bouton « Passer la commande » : redirige vers Stripe, ou explique pourquoi ce n'est pas possible. */
export function CheckoutButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState<CheckoutResult | null, FormData>(async () => startCheckout(), null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <button type="submit" disabled={pending} className="w-full rounded-pill bg-ink px-6 py-[1.125rem] text-sm font-bold text-white disabled:opacity-60">
        {pending ? "Redirection vers le paiement…" : label}
      </button>
      {state && !state.ok && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-4 py-3 text-[0.8125rem] font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
