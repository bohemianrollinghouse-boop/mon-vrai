"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cartCodes, getCart, saveCart } from "@/lib/db/carts";
import { checkPromoCodes } from "@/lib/promos/resolve";
import { getProduct } from "@/lib/db/products";
import { addQty, setLineQty } from "@/lib/domain/cart-math";
import { Slug } from "@/lib/domain/types";
import { ensureCartId } from "./cookie";

/*
 * Actions serveur du panier. Chacune est un point d'entrée public : les entrées sont
 * validées, le produit est relu en base, et rien du client n'est cru sur parole.
 * `revalidatePath` rafraîchit l'en-tête (compteur) et la page panier dans la même
 * réponse.
 */

export type CartActionResult = { ok: true; count: number } | { ok: false; error: string };

const AddInput = z.object({ slug: Slug, qty: z.coerce.number().int().min(1).max(50).default(1) });

export async function addToCart(formData: FormData): Promise<CartActionResult> {
  const parsed = AddInput.safeParse({ slug: formData.get("slug"), qty: formData.get("qty") ?? 1 });
  if (!parsed.success) return { ok: false, error: "Article invalide" };

  const product = await getProduct(parsed.data.slug);
  if (!product || product.status !== "published") return { ok: false, error: "Ce livre n'est plus disponible" };
  if (product.stock !== null && product.stock <= 0 && !product.preorder.enabled) {
    return { ok: false, error: "Ce livre est épuisé" };
  }

  const id = await ensureCartId();
  const cart = await getCart(id);
  const lines = addQty(cart.lines, product.slug, parsed.data.qty);
  await saveCart(id, { lines, promoCodes: cartCodes(cart) });
  refresh();
  return { ok: true, count: lines.reduce((n, l) => n + l.qty, 0) };
}

const SetInput = z.object({ slug: Slug, qty: z.coerce.number().int().min(0).max(50) });

export async function setCartQty(formData: FormData): Promise<CartActionResult> {
  const parsed = SetInput.safeParse({ slug: formData.get("slug"), qty: formData.get("qty") });
  if (!parsed.success) return { ok: false, error: "Quantité invalide" };

  const id = await ensureCartId();
  const cart = await getCart(id);
  const lines = setLineQty(cart.lines, parsed.data.slug, parsed.data.qty);
  await saveCart(id, { lines, promoCodes: cartCodes(cart) });
  refresh();
  return { ok: true, count: lines.reduce((n, l) => n + l.qty, 0) };
}

export async function removeFromCart(formData: FormData): Promise<CartActionResult> {
  formData.set("qty", "0");
  return setCartQty(formData);
}

const PromoInput = z.object({ code: z.string().trim().max(40) });

export async function setPromoCode(formData: FormData): Promise<CartActionResult> {
  const parsed = PromoInput.safeParse({ code: formData.get("code") ?? "" });
  if (!parsed.success) return { ok: false, error: "Code invalide" };

  const id = await ensureCartId();
  const cart = await getCart(id);
  // Le code est mémorisé, puis transmis à Stripe au paiement, seul à pouvoir le valider.
  await saveCart(id, { lines: cart.lines, promoCodes: parsed.data.code ? [parsed.data.code.toUpperCase()] : [] });
  refresh();
  return { ok: true, count: cart.lines.reduce((n, l) => n + l.qty, 0) };
}

/** Ajoute un code promo au panier après l'avoir validé (existence, période, cumul…). */
export async function addPromoCode(formData: FormData): Promise<CartActionResult> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 2) return { ok: false, error: "Saisissez un code." };
  const id = await ensureCartId();
  const cart = await getCart(id);
  const current = cartCodes(cart);
  if (current.includes(code)) return { ok: false, error: "Ce code est déjà appliqué." };
  const check = await checkPromoCodes([...current, code]);
  const refused = check.rejected.find((r) => r.code === code);
  if (refused) return { ok: false, error: refused.reason };
  await saveCart(id, { lines: cart.lines, promoCodes: [...current, code] });
  refresh();
  return { ok: true, count: cart.lines.reduce((n, l) => n + l.qty, 0) };
}

export async function removePromoCode(formData: FormData): Promise<CartActionResult> {
  const code = String(formData.get("code") ?? "").toUpperCase();
  const id = await ensureCartId();
  const cart = await getCart(id);
  await saveCart(id, { lines: cart.lines, promoCodes: cartCodes(cart).filter((c) => c !== code) });
  refresh();
  return { ok: true, count: cart.lines.reduce((n, l) => n + l.qty, 0) };
}

export async function removePromoCodeForm(formData: FormData): Promise<void> {
  await removePromoCode(formData);
}

/*
 * Variantes pour `<form action>` : React exige une action qui ne renvoie rien. Les
 * versions ci-dessus gardent leur résultat pour useActionState ; celles-ci l'ignorent.
 */
export async function addToCartForm(formData: FormData): Promise<void> {
  await addToCart(formData);
}

export async function setCartQtyForm(formData: FormData): Promise<void> {
  await setCartQty(formData);
}

export async function removeFromCartForm(formData: FormData): Promise<void> {
  await removeFromCart(formData);
}

function refresh() {
  revalidatePath("/", "layout");
}
