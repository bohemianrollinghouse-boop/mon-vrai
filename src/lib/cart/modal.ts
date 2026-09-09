"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cartCodes, getCart, saveCart } from "@/lib/db/carts";
import { getProductsBySlugs, listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { addQty, itemCount, priceLines, subtotal } from "@/lib/domain/cart-math";
import { collectionDiscount, collectionState, toCollectionTitles } from "@/lib/promos/collection";
import type { Tint } from "@/lib/domain/types";
import { ensureCartId, readCartId } from "./cookie";
import type { CartActionResult } from "./actions";

/*
 * Données de la modal « Ajouté au panier » (maquette 10A) et action « compléter la
 * collection ». Tout est recalculé côté serveur à partir du panier et des réglages : le
 * navigateur n'impose jamais un montant ni un état d'offre. La modal, l'encart catalogue
 * et le bloc du panier consomment la même source.
 */

export type CartModalProduct = {
  slug: string;
  name: string;
  ageLabel: string;
  qty: number;
  /** Total de la ligne (prix unitaire × quantité), en centimes. */
  lineTotal: number;
  image?: string;
  tint: Tint;
  preorder: boolean;
};

export type CartModalSuggestion = { slug: string; name: string; image?: string; tint: Tint; price: number };

export type CartModalData = {
  /** Produit qui vient d'être ajouté (absent pour un ajout « collection »). */
  added: CartModalProduct | null;
  /** L'offre collection est-elle activée dans l'admin ? */
  offerEnabled: boolean;
  /** La collection est-elle complète (tous les titres publiés dans le panier) ? */
  complete: boolean;
  totalTitles: number;
  missingCount: number;
  /** Coût des titres manquants (centimes) pour le bouton « Compléter · +X € ». */
  missingCost: number;
  /** Prix plein de la collection (centimes). */
  fullPrice: number;
  /** Prix de la collection avec l'offre (centimes). */
  offerPrice: number;
  /** Remise appliquée quand la collection est complète (centimes). */
  collectionDiscount: number;
  suggestions: CartModalSuggestion[];
  /** Sous-total du panier (centimes). */
  subtotal: number;
  /** Nombre d'articles dans le panier. */
  count: number;
};

const SlugArg = z.string().max(120).optional();

/** Instantané du panier pour la modal, après un ajout (ou pour un ajout collection si `addedSlug` absent). */
export async function cartModalSnapshot(addedSlug?: string): Promise<CartModalData> {
  const slug = SlugArg.parse(addedSlug);
  const id = await readCartId();
  const cart = id ? await getCart(id) : { lines: [], promoCodes: [], updatedAt: 0 };
  const [products, settings, published] = await Promise.all([
    getProductsBySlugs(cart.lines.map((l) => l.productSlug)),
    getSettings(),
    listPublishedProducts(),
  ]);
  const lines = priceLines(cart.lines, products);
  const ownedSlugs = new Set(lines.map((l) => l.product.slug));
  const titles = toCollectionTitles(published);
  const state = collectionState(titles, ownedSlugs, settings.promos.collectionOffer.enabled);

  const addedLine = slug ? lines.find((l) => l.product.slug === slug) : undefined;
  const added: CartModalProduct | null = addedLine
    ? {
        slug: addedLine.product.slug,
        name: addedLine.product.title,
        ageLabel: addedLine.product.ageLabel,
        qty: addedLine.qty,
        lineTotal: addedLine.lineTotal,
        image: addedLine.product.images[0]?.url,
        tint: addedLine.product.tint,
        preorder: addedLine.product.preorder.enabled,
      }
    : null;

  // Suggestions : jusqu'à 3 titres publiés absents du panier (hors produit ajouté).
  const suggestions: CartModalSuggestion[] = titles
    .filter((t) => !ownedSlugs.has(t.slug) && t.slug !== slug)
    .slice(0, 3)
    .map((t) => ({ slug: t.slug, name: t.title, image: t.image, tint: t.tint, price: t.price }));

  return {
    added,
    offerEnabled: state.enabled,
    complete: state.complete,
    totalTitles: state.totalTitles,
    missingCount: state.missing.length,
    missingCost: state.missingCost,
    fullPrice: state.fullPrice,
    offerPrice: state.offerPrice,
    collectionDiscount: collectionDiscount(state),
    suggestions,
    subtotal: subtotal(lines),
    count: itemCount(lines),
  };
}

/**
 * Ajoute au panier tous les titres publiés absents (quantité 1 chacun) pour compléter la
 * collection. Utilisée par l'encart « Précommander la collection », le bloc « Compléter »
 * du panier et le bouton « Compléter » de la modal.
 */
export async function completeCollectionAction(): Promise<CartActionResult> {
  const [published, id] = await Promise.all([listPublishedProducts(), ensureCartId()]);
  const cart = await getCart(id);
  const owned = new Set(cart.lines.map((l) => l.productSlug));
  let lines = cart.lines;
  for (const p of published) {
    if (!owned.has(p.slug)) lines = addQty(lines, p.slug, 1);
  }
  await saveCart(id, { lines, promoCodes: cartCodes(cart) });
  revalidatePath("/", "layout");
  return { ok: true, count: lines.reduce((n, l) => n + l.qty, 0) };
}
