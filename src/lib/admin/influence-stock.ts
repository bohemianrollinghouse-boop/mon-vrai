import type { Campaign, Contest, Order, Product } from "@/lib/domain/types";
import { offeredOrder, tookSaleStock } from "@/lib/domain/order-state";
import { contestState } from "@/lib/contests/state";
import { TO_SHIP } from "./order-ui";

/*
 * Le stock INFLUENCE : les exemplaires mis de côté pour les partenaires et les jeux.
 *
 * Trois nombres, et ils ne disent pas la même chose :
 *
 * - **sur l'étagère** (`shelf`) : ce que la fiche du titre compte aujourd'hui. Il baisse
 *   tout seul à la commande d'un kit ou d'un lot, comme le stock de vente baisse au
 *   paiement — c'est le moment où les livres partent vraiment.
 * - **réservé** (`reserved`) : déjà sorti du compte, pas encore du carton (colis offert
 *   payé, pas encore expédié). L'étagère et le réservé additionnés donnent le physique :
 *   ce qu'on doit trouver en se levant.
 * - **engagé** (`committed`) : PROMIS, pas encore sorti — les kits des campagnes
 *   ouvertes que personne n'a encore commandés, les lots des concours qui n'ont pas
 *   trouvé preneur. Rien n'est décompté pour eux, sans quoi une campagne appliquée à
 *   cinq partenaires viderait l'étagère cinq fois avant le premier envoi. C'est
 *   `free` = étagère − engagé qui dit ce qu'on peut encore promettre.
 *
 * Tout est pur : l'écran, les décomptes et les tests doivent répondre la même chose.
 */

export type InfluenceRow = {
  slug: string;
  title: string;
  /** Ce que la fiche compte : disponible pour un prochain kit. */
  shelf: number;
  /** Sorti du compte, pas encore du carton. */
  reserved: number;
  /** Promis par une campagne ouverte ou un concours en cours. */
  committed: number;
  /** Étagère − engagé : ce qu'on peut encore promettre sans se découvrir. */
  free: number;
};

/** Ce qu'un kit ou un lot déjà commandé n'a pas encore quitté la maison. */
export function influenceReserved(orders: Order[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    /* Les colis offerts pris sur le stock de vente sont comptés là-bas, pas ici. */
    if (!offeredOrder(o) || tookSaleStock(o) || !TO_SHIP.includes(o.status)) continue;
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
 * pris leur part de l'étagère.
 */
export function influenceCommitments(campaigns: Campaign[], contests: Contest[], now: number): Map<string, number> {
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
  const reserved = influenceReserved(orders);
  const committed = influenceCommitments(campaigns, contests, now);
  return products.map((p) => {
    const shelf = p.influenceStock;
    const promised = committed.get(p.slug) ?? 0;
    return { slug: p.slug, title: p.title, shelf, reserved: reserved.get(p.slug) ?? 0, committed: promised, free: shelf - promised };
  });
}

/** Les titres dont les promesses dépassent l'étagère : c'est ce qui appelle un carton. */
export const shortTitles = (rows: InfluenceRow[]): InfluenceRow[] => rows.filter((r) => r.free < 0);
