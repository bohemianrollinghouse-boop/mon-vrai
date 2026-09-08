import "server-only";
import { cookies } from "next/headers";
import { getInfluencer, getInfluencersByIds, getPromosByCodes } from "@/lib/db/promos";
import { listOrdersForEmail } from "@/lib/db/orders";
import type { Influencer, Order } from "@/lib/domain/types";
import { applyPromos, type PricedItem, type PromoContext, type PromoOutcome } from "./engine";

/*
 * Pont entre le moteur (pur) et la base : charge les codes, l'influenceur du lien, les
 * utilisations passées du client, et rend le résultat. Tout ce qui touche aux codes
 * promo côté serveur passe ici.
 */

export const REF_COOKIE = "mv_ref";
export const REF_DAYS = 30;

export async function readRefInfluencer(): Promise<Influencer | null> {
  const id = (await cookies()).get(REF_COOKIE)?.value;
  if (!id) return null;
  return getInfluencer(id).catch(() => null);
}

export async function usedCodesByEmail(email: string | undefined, codes: string[]): Promise<Record<string, number>> {
  if (!email || codes.length === 0) return {};
  const orders = await listOrdersForEmail(email).catch(() => [] as Order[]);
  const counted = orders.filter((o) => o.status !== "pending_payment" && o.status !== "cancelled");
  const out: Record<string, number> = {};
  for (const o of counted) for (const c of o.promoCodes) out[c] = (out[c] ?? 0) + 1;
  return out;
}

export type ResolveInput = { codes: string[]; items: PricedItem[]; subtotal: number; email?: string; refInfluencer?: Influencer | null };

export async function resolvePromos(input: ResolveInput): Promise<PromoOutcome> {
  const ref = input.refInfluencer === undefined ? await readRefInfluencer() : input.refInfluencer;
  const wanted = [...input.codes, ...(ref ? [ref.code] : [])];
  const promos = await getPromosByCodes(wanted);
  const influencerIds = [...promos.values()].map((p) => p.influencerId).filter((x): x is string => Boolean(x));
  const influencers = await getInfluencersByIds([...influencerIds, ...(ref ? [ref.id] : [])]);
  if (ref) influencers.set(ref.id, ref);
  const ctx: PromoContext = {
    now: Date.now(),
    subtotal: input.subtotal,
    items: input.items,
    usedByCustomer: await usedCodesByEmail(input.email, wanted),
    refInfluencer: ref,
    promos,
    influencers,
  };
  return applyPromos(input.codes, ctx);
}

/** Vérification rapide à l'ajout d'un code dans le panier (sans e-mail ni panier chiffré précis). */
export async function checkPromoCodes(codes: string[]): Promise<PromoOutcome> {
  const { loadCart } = await import("@/lib/cart/read");
  const view = await loadCart();
  return resolvePromos({
    codes,
    items: view.lines.map((l) => ({ slug: l.product.slug, qty: l.qty, unitPrice: l.product.price, title: l.product.title, stock: l.product.stock })),
    subtotal: view.subtotal,
    refInfluencer: null,
  });
}
