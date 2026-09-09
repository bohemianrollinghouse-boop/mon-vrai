import "server-only";
import { cookies } from "next/headers";
import { newCartId } from "@/lib/db/carts";

/*
 * Le panier est identifié par un cookie opaque, httpOnly : le navigateur ne peut ni
 * le lire ni forger l'identifiant d'un autre visiteur. Trente jours d'inactivité et
 * il expire - assez pour revenir finir une précommande.
 */

export const CART_COOKIE = "mv_cart";
const CART_DAYS = 30;

/** Lecture seule, utilisable dans une page : null si aucun panier n'a encore été créé. */
export async function readCartId(): Promise<string | null> {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

/**
 * Renvoie l'identifiant, en le créant au besoin. Écrit un cookie, donc réservé aux
 * actions serveur et aux route handlers - jamais pendant le rendu d'une page.
 */
export async function ensureCartId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_COOKIE)?.value;
  if (existing) return existing;
  const id = newCartId();
  store.set(CART_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_DAYS * 24 * 60 * 60,
  });
  return id;
}

export async function forgetCartId(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}
