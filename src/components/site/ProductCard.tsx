import Image from "next/image";
import Link from "next/link";
import { formatEuroShort } from "@/lib/domain/money";
import { productPath } from "@/lib/domain/system-pages";
import type { Product } from "@/lib/domain/types";
import { AddToCartButton } from "./AddToCartButton";
import { TINT_BG } from "./ui";

/*
 * Carte produit de la maquette, en deux densités :
 *  - « compact » (accueil) : vignette sur fond blanc, nom, bouton avec le prix ;
 *  - « detailed » (catalogue, recherche) : vignette teintée, liste du contenu, prix et
 *    bouton séparés.
 */

const BADGE_LABEL: Record<Product["badge"], string | null> = {
  none: null,
  new: "Nouveauté",
  reissue: "Nouvelle édition",
};

export function ctaLabel(product: Product): string {
  if (product.stock !== null && product.stock <= 0 && !product.preorder.enabled) return "Épuisé";
  return product.preorder.enabled ? "Précommander" : "Ajouter au panier";
}

export function ProductCard({ product, variant = "detailed" }: { product: Product; variant?: "compact" | "detailed" }) {
  const image = product.images[0];
  const badge = BADGE_LABEL[product.badge];
  const detailed = variant === "detailed";
  const soldOut = product.stock !== null && product.stock <= 0 && !product.preorder.enabled;
  const href = productPath(product.slug);

  return (
    <div className={`flex flex-col rounded-card bg-white transition-transform hover:-translate-y-[3px] ${detailed ? "gap-[1.125rem] p-6" : "gap-4 p-5"}`}>
      <Link href={href} className={`relative block aspect-square min-h-0 rounded-thumb ${TINT_BG[product.tint]}`}>
        {image && (
          <div className={`absolute overflow-hidden rounded-[10px] ${detailed ? "inset-3.5" : "inset-2.5"}`}>
            <Image
              src={image.url}
              alt={image.alt || product.title}
              fill
              sizes="(min-width: 990px) 25vw, (min-width: 750px) 45vw, 80vw"
              className="object-cover"
            />
          </div>
        )}
        {badge && <span className="absolute left-3.5 top-3.5 rounded-pill bg-white px-2.5 py-1.5 text-[0.6875rem] font-bold">{badge}</span>}
      </Link>

      <Link href={href} className="flex flex-col gap-1.5">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">{product.ageLabel}</span>
        <span className={`font-bold ${detailed ? "text-lg tracking-[-0.01em]" : "text-[0.9375rem]"}`}>{product.title}</span>
        {detailed && product.items.length > 0 && (
          <span className="text-[0.8125rem] leading-relaxed text-muted">{joinItems(product.items)}</span>
        )}
      </Link>

      {detailed ? (
        <div className="mt-auto flex items-center justify-between gap-4">
          <span className="font-extrabold">{formatEuroShort(product.price)}</span>
          <AddToCartButton slug={product.slug} label={ctaLabel(product)} price={product.price} variant="detailed" disabled={soldOut} />
        </div>
      ) : (
        <AddToCartButton slug={product.slug} label={ctaLabel(product)} price={product.price} variant="compact" disabled={soldOut} />
      )}
    </div>
  );
}

/** « la pomme, la clémentine, … et le kiwi » — la liste redevient une phrase. */
export function joinItems(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}
