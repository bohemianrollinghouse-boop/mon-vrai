import type { Campaign, Contest, Order, Product } from "@/lib/domain/types";
import { offeredOrder, tookSaleStock } from "@/lib/domain/order-state";
import { contestState } from "@/lib/contests/state";

/*
 * Le stock INFLUENCE : les exemplaires mis de côté pour les partenaires et les jeux.
 *
 * Trois colonnes, et une soustraction :
 *
 * - **stock** : ce qu'on a mis de côté. Un nombre à soi, qui ne bouge QUE si on le
 *   change — il ne se décompte pas tout seul (voir `createGiftOrder`).
 * - **envoyé** : ce que les kits et les lots ont emporté, lu sur les commandes
 *   elles-mêmes. D'où deux propriétés qu'un compteur n'aurait pas : les kits partis
 *   AVANT l'existence de ce stock y figurent, et une commande annulée en sort d'elle-même.
 * - **disponible** = stock − envoyé − réservé.
 *
 * `réservé` ne fait pas une colonne : c'est ce qu'une campagne ouverte ou un concours en
 * cours a promis sans que personne ait encore commandé. Un exemplaire promis n'est plus
 * disponible, mais il n'est pas parti non plus — il se dit en une ligne sous le titre,
 * là où l'on explique l'écart. Rien n'est décompté pour lui, sans quoi une campagne
 * appliquée à cinq partenaires viderait le stock cinq fois avant le premier envoi.
 *
 * Le jour où le kit est commandé, l'exemplaire passe de « réservé » à « envoyé » : le
 * disponible ne bouge pas, il avait déjà été retenu. Il ne bouge que lorsqu'on promet
 * davantage, ou qu'on met de côté un carton de plus.
 *
 * Tout est pur : l'écran, les décomptes et les tests doivent répondre la même chose.
 */

export type InfluenceRow = {
  slug: string;
  title: string;
  /** Ce qu'on a mis de côté, à la main. */
  stock: number;
  /** Ce que les kits et les lots ont emporté, depuis toujours. */
  sent: number;
  /** Promis par une campagne ouverte ou un concours en cours, pas encore commandé. */
  reserved: number;
  /** Stock − envoyé − réservé : ce qu'on peut encore promettre. */
  available: number;
};

/*
 * Ce que les kits et les lots ont emporté, d'après les commandes elles-mêmes — toutes
 * celles qui ont pris sur ce stock, quel que soit leur âge. Une commande annulée ou
 * remboursée ne compte pas : ses exemplaires sont revenus, ou ne sont jamais partis.
 */
export function influenceSent(orders: Order[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (!offeredOrder(o) || tookSaleStock(o)) continue;
    if (o.status === "cancelled" || o.status === "refunded") continue;
    for (const l of o.lines) m.set(l.productSlug, (m.get(l.productSlug) ?? 0) + l.qty);
  }
  return m;
}

/*
 * Ce qui est promis sans être encore commandé.
 *
 * Une participation compte tant que son kit n'est pas commandé et qu'elle court
 * (ouverte ou en cours) : terminée ou annulée, elle ne doit plus rien. Un concours
 * compte autant de lots qu'il lui reste de gagnants à servir — ceux déjà expédiés sont
 * comptés parmi les envois.
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
    const served = contest.winners.filter((w) => w.orderId).length;
    const owed = Math.max(0, contest.winnersWanted - served);
    for (const l of contest.prize.lines) add(l.slug, l.qty * owed);
  }

  return m;
}

/*
 * Une ligne par titre, dans l'ordre du catalogue. Tous les titres y figurent, même à
 * zéro : un stock influence vide se règle en mettant des exemplaires de côté, et il faut
 * pouvoir désigner le titre pour le faire.
 */
export function influenceRows(products: Product[], orders: Order[], campaigns: Campaign[], contests: Contest[], now: number): InfluenceRow[] {
  const sent = influenceSent(orders);
  const reserved = influenceReserved(campaigns, contests, now);
  return products.map((p) => {
    const gone = sent.get(p.slug) ?? 0;
    const promised = reserved.get(p.slug) ?? 0;
    return { slug: p.slug, title: p.title, stock: p.influenceStock, sent: gone, reserved: promised, available: p.influenceStock - gone - promised };
  });
}

/** Les titres dont les envois et les promesses dépassent le stock : il en manque. */
export const shortTitles = (rows: InfluenceRow[]): InfluenceRow[] => rows.filter((r) => r.available < 0);
