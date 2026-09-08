import "server-only";
import { Cart } from "@/lib/domain/types";
import { col, newId, now, parseDoc } from "./helpers";

/*
 * Le panier vit côté serveur, identifié par un cookie opaque. Un visiteur retrouve
 * donc son panier d'un onglet à l'autre, et le paiement lit exactement ce que la
 * page affichait — pas une copie côté navigateur qui aurait pu diverger.
 *
 * Les paniers abandonnés sont purgés par une tâche planifiée (voir scripts/).
 */

const carts = () => col("carts");

export function newCartId(): string {
  return newId("cart");
}

export async function getCart(id: string): Promise<Cart> {
  return (await parseDoc(Cart, await carts().doc(id).get())) ?? { lines: [], promoCodes: [], updatedAt: 0 };
}

export async function saveCart(id: string, cart: Omit<Cart, "updatedAt">): Promise<Cart> {
  const doc = Cart.parse({ ...cart, updatedAt: now() });
  await carts().doc(id).set(doc);
  return doc;
}

export async function clearCart(id: string): Promise<void> {
  await carts().doc(id).delete();
}

/** Codes du panier, ancien champ compris. */
export function cartCodes(cart: Cart): string[] {
  const codes = [...cart.promoCodes];
  if (cart.promoCode && !codes.includes(cart.promoCode.toUpperCase())) codes.push(cart.promoCode.toUpperCase());
  return codes;
}
