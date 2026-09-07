import "server-only";
import { getCart } from "@/lib/db/carts";
import { getProductsBySlugs } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { freeShippingProgress, itemCount, priceLines, subtotal, type PricedLine } from "@/lib/domain/cart-math";
import type { Cart } from "@/lib/domain/types";
import { readCartId } from "./cookie";

/*
 * Vue complète du panier pour l'affichage : lignes chiffrées, total, compteur, jauge.
 * Une seule fonction, appelée par la page panier, l'en-tête et le paiement, pour que
 * tous montrent les mêmes chiffres.
 */

export type CartView = {
  id: string | null;
  cart: Cart;
  lines: PricedLine[];
  count: number;
  subtotal: number;
  shipping: ReturnType<typeof freeShippingProgress>;
};

export async function loadCart(): Promise<CartView> {
  const id = await readCartId();
  const cart: Cart = id ? await getCart(id) : { lines: [], updatedAt: 0 };
  const [products, settings] = await Promise.all([
    getProductsBySlugs(cart.lines.map((l) => l.productSlug)),
    getSettings(),
  ]);
  const lines = priceLines(cart.lines, products);
  const sub = subtotal(lines);
  return {
    id,
    cart,
    lines,
    count: itemCount(lines),
    subtotal: sub,
    shipping: freeShippingProgress(sub, settings.shipping.freeThreshold),
  };
}

/** Juste le nombre d'articles, pour la pastille de l'en-tête. */
export async function loadCartCount(): Promise<number> {
  const id = await readCartId();
  if (!id) return 0;
  const cart = await getCart(id);
  return itemCount(cart.lines);
}
