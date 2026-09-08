"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import type { AccountResult } from "@/lib/account/actions";

/** Formulaire de l'espace client : action serveur, message de résultat, rafraîchissement. */
export function AccountForm({ action, children, submitLabel, className = "", redirectTo, confirm, variant = "dark" }: { action: (fd: FormData) => Promise<AccountResult>; children: ReactNode; submitLabel: string; className?: string; redirectTo?: string; confirm?: string; variant?: "dark" | "light" | "danger" }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AccountResult | null, FormData>(async (_p, fd) => action(fd), null);
  useEffect(() => {
    if (state?.ok) {
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    }
  }, [state, router, redirectTo]);
  const btn = { dark: "bg-ink text-white", light: "bg-paper text-ink", danger: "bg-danger-bg text-danger" }[variant];
  return (
    <form action={formAction} onSubmit={(e) => confirm && !window.confirm(confirm) && e.preventDefault()} className={`flex flex-col gap-4 ${className}`}>
      {children}
      {state && !state.ok && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-[14px] bg-tint-green px-4 py-3 text-sm font-semibold text-tint-green-ink">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`w-fit rounded-pill px-6 py-3 text-[0.8125rem] font-bold disabled:opacity-60 ${btn}`}>
        {pending ? "…" : submitLabel}
      </button>
    </form>
  );
}
