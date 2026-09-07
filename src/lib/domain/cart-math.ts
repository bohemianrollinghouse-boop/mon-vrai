import type { CartLine, Product } from "./types";

/*
 * Calculs du panier, sans effet de bord : ils prennent des lignes et des produits,
 * rendent des centimes. La page panier, le résumé et Stripe partagent ces fonctions
 * pour ne jamais afficher deux totaux différents.
 */

export type PricedLine = {
  product: Product;
  qty: number;
  lineTotal: number;
};

/** Associe chaque ligne à son produit ; une ligne dont le produit a disparu est ignorée. */
export function priceLines(lines: CartLine[], products: Map<string, Product>): PricedLine[] {
  const out: PricedLine[] = [];
  for (const line of lines) {
    const product = products.get(line.productSlug);
    if (!product || product.status !== "published") continue;
    out.push({ product, qty: line.qty, lineTotal: product.price * line.qty });
  }
  return out;
}

export function subtotal(lines: PricedLine[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

export function itemCount(lines: { qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/**
 * Jauge de livraison offerte. `threshold` à 0 désactive la jauge.
 * `remaining` est plancher à 0 ; `percent` est plafonné à 100.
 */
export function freeShippingProgress(
  subtotalCents: number,
  threshold: number,
): { enabled: boolean; reached: boolean; remaining: number; percent: number } {
  if (threshold <= 0) return { enabled: false, reached: false, remaining: 0, percent: 0 };
  const remaining = Math.max(0, threshold - subtotalCents);
  const percent = Math.min(100, Math.round((subtotalCents / threshold) * 100));
  return { enabled: true, reached: remaining === 0, remaining, percent };
}

/**
 * Fusionne une quantité dans le panier : ajoute, remplace ou retire la ligne.
 * Une quantité ≤ 0 retire la ligne. Le panier reste borné pour éviter les abus.
 */
export function setLineQty(lines: CartLine[], productSlug: string, qty: number, max = 50): CartLine[] {
  const others = lines.filter((l) => l.productSlug !== productSlug);
  if (qty <= 0) return others;
  return [...others, { productSlug, qty: Math.min(qty, max) }];
}

export function addQty(lines: CartLine[], productSlug: string, delta: number, max = 50): CartLine[] {
  const current = lines.find((l) => l.productSlug === productSlug)?.qty ?? 0;
  return setLineQty(lines, productSlug, current + delta, max);
}
