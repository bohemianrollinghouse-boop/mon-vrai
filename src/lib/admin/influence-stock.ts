import type { Campaign, Contest, Order, Product } from "@/lib/domain/types";
import { offeredOrder, tookSaleStock } from "@/lib/domain/order-state";
import { contestState } from "@/lib/contests/state";

/*
 * Le stock INFLUENCE : les exemplaires mis de côté pour les partenaires et les jeux.
 *
 * Deux nombres à l'écran, un troisième qui les relie :
 *
 * - **stock** : ce qui reste, tout simplement. On l'augmente à la main quand un carton
 *   arrive, et il baisse tout seul à la commande d'un kit ou d'un lot — c'est là que les
 *   livres partent vraiment.
 * - **disponible** = stock − réservé : ce qu'on peut encore promettre.
 * - **réservé**, qui ne fait pas une colonne : promis par une campagne ouverte ou un
 *   concours en cours, sans que personne ait encore commandé. Un exemplaire promis n'est
 *   plus disponible, et c'est tout ce qu'on a besoin d'en savoir — il se dit en une
 *   ligne sous le titre, pour que l'écart entre les deux colonnes s'explique. Rien n'est
 *   décompté pour lui, sans quoi une campagne appliquée à cinq partenaires viderait le
 *   stock cinq fois avant le premier envoi.
 *
 * À côté de ces trois-là, un quatrième qui ne se calcule pas pareil : **parti**, le
 * nombre d'exemplaires que les kits et les lots ont emportés depuis toujours. Il se lit
 * dans les commandes, et non dans le compteur — ce qui permet de recoller quand le
 * compteur ne sait pas tout, notamment pour les kits envoyés AVANT l'existence de ce
 * stock, que rien n'a jamais décomptés.
 *
 * Un livre passe donc de « réservé » à « parti » d'un seul coup : au moment où le kit
 * est commandé, le stock baisse ET la promesse tombe, si bien que le disponible ne
 * bouge pas — il avait déjà été retenu. Il ne bouge que lorsqu'on promet davantage, ou
 * qu'on reçoit un carton.
 *
 * Tout est pur : l'écran, les décomptes et les tests doivent répondre la même chose.
 */

export type InfluenceRow = {
  slug: string;
  title: string;
  /** Ce qui reste : le compteur du titre, déjà amputé des kits commandés. */
  stock: number;
  /** Promis par une campagne ouverte ou un concours en cours, pas encore commandé. */
  reserved: number;
  /** Stock − réservé : ce qu'on peut encore promettre sans se découvrir. */
  available: number;
  /** Exemplaires emportés par des kits et des lots depuis toujours, compteur ou non. */
  gone: number;
};

/*
 * Ce que les kits et les lots ont emporté, d'après les commandes elles-mêmes — toutes
 * celles qui ont pris sur ce stock, quel que soit leur âge. Une commande annulée ou
 * remboursée ne compte pas : ses exemplaires sont revenus (ou ne sont jamais partis).
 */
export function influenceGone(orders: Order[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (!offeredOrder(o) || tookSaleStock(o)) continue;
    if (o.status === "cancelled" || o.status === "refunded") continue;
    for (const l of o.lines) m.set(l.productSlug, (m.get(l.productSlug) ?? 0) + l.qty);
  }
  return m;
}

/*
 * Ce qui est promis sans être encore sorti.
 *
 * Une participation compte tant que son kit n'est pas commandé et qu'elle court
 * (ouverte ou en cours) : terminée ou annulée, elle ne doit plus rien. Un concours
 * compte autant de lots qu'il lui reste de gagnants à servir — ceux déjà expédiés ont
 * pris leur part du stock.
 */
export function influenceReserved(campaigns: Campaign[], contests: Contest[], now: number): Map<string, number> {
  const m = new Map<string, number>();
  const add = (slug: string, qty: number) => m.set(slug, (m.get(slug) ?? 0) + qty);

  for (const c of campaigns) {
    if (!c.kit.enabled || c.kit.deductStock || c.kitOrderId) continue;
    if (c.status !== "draft" && c.status !== "active") continue;
    for (const l of c.kit.lines) add(l.slug, l.qty);
  }

  for (const contest of contests) {
    if (contest.prize.deductStock) continue;
    const state = contestState(contest, now);
    if (state === "draft" || state === "closed") continue;
    const sent = contest.winners.filter((w) => w.orderId).length;
    const owed = Math.max(0, contest.winnersWanted - sent);
    for (const l of contest.prize.lines) add(l.slug, l.qty * owed);
  }

  return m;
}

/*
 * Une ligne par titre, dans l'ordre du catalogue. Tous les titres y figurent, même à
 * zéro : un stock influence vide se règle en recevant un carton, et il faut pouvoir
 * désigner le titre pour le faire.
 */
export function influenceRows(products: Product[], orders: Order[], campaigns: Campaign[], contests: Contest[], now: number): InfluenceRow[] {
  const reserved = influenceReserved(campaigns, contests, now);
  const gone = influenceGone(orders);
  return products.map((p) => {
    const promised = reserved.get(p.slug) ?? 0;
    return { slug: p.slug, title: p.title, stock: p.influenceStock, reserved: promised, available: p.influenceStock - promised, gone: gone.get(p.slug) ?? 0 };
  });
}

/** Les titres dont les promesses dépassent le stock : c'est ce qui appelle un carton. */
export const shortTitles = (rows: InfluenceRow[]): InfluenceRow[] => rows.filter((r) => r.available < 0);
