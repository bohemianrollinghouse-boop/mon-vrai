"use client";

import { useTransition } from "react";
import { addToCart } from "@/lib/cart/actions";
import { formatEuroShort } from "@/lib/domain/money";
import { useCartModal } from "./CartModal";

/*
 * Bouton d'ajout au panier des cartes catalogue (maquette 3a) : ajoute le titre puis
 * ouvre la modal « Ajouté au panier ». La carte reste un lien vers la fiche ; seul ce
 * bouton ajoute, en stoppant la propagation du clic pour ne pas naviguer.
 */
export function AddToCartButton({ slug, label, price, variant = "detailed", disabled = false }: { slug: string; label: string; price: number; variant?: "compact" | "detailed"; disabled?: boolean }) {
  const { openCartModal } = useCartModal();
  const [pending, startTransition] = useTransition();

  const classes = variant === "detailed" ? "rounded-pill bg-ink px-[1.125rem] py-3 text-xs font-bold text-white" : "w-fit rounded-pill bg-ink px-4 py-2.5 text-xs font-bold text-white";

  if (disabled) {
    return <span className={`${classes} opacity-50`}>{label}</span>;
  }

  const add = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("qty", "1");
      const result = await addToCart(fd);
      if (result.ok) openCartModal({ slug });
    });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        add();
      }}
      disabled={pending}
      className={`${classes} disabled:opacity-50`}
    >
      {variant === "detailed" ? (pending ? "Ajout…" : label) : `${pending ? "Ajout…" : label} · ${formatEuroShort(price)}`}
    </button>
  );
}
