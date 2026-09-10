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

type Variant = "compact" | "detailed";

function buttonClass(variant: Variant): string {
  return variant === "detailed"
    ? "rounded-pill bg-ink px-[1.125rem] py-3 text-xs font-bold text-white"
    : "w-fit rounded-pill bg-ink px-4 py-2.5 text-xs font-bold text-white";
}

function buttonLabel(label: string, price: number, variant: Variant): string {
  return variant === "detailed" ? label : `${label} · ${formatEuroShort(price)}`;
}

/*
 * Le même bouton, inerte. Sert au titre épuisé, et à l'aperçu de l'éditeur de blocs :
 * hors du site, il n'y a pas de <CartModalProvider>, et useCartModal lèverait dès le
 * rendu — un hook s'exécute avant toute condition.
 */
export function AddToCartPlaceholder({ label, price, variant = "detailed", dimmed = false }: { label: string; price: number; variant?: Variant; dimmed?: boolean }) {
  return <span className={`${buttonClass(variant)}${dimmed ? " opacity-50" : ""}`}>{buttonLabel(label, price, variant)}</span>;
}
export function AddToCartButton({ slug, label, price, variant = "detailed", disabled = false }: { slug: string; label: string; price: number; variant?: Variant; disabled?: boolean }) {
  const { openCartModal } = useCartModal();
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return <AddToCartPlaceholder label={label} price={price} variant={variant} dimmed />;
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
      className={`${buttonClass(variant)} disabled:opacity-50`}
    >
      {buttonLabel(pending ? "Ajout…" : label, price, variant)}
    </button>
  );
}
