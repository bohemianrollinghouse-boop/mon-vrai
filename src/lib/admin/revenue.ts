import { parcelWeightKg } from "@/lib/boxtal/request";
import type { Costs, Order, SiteSettings } from "@/lib/domain/types";
import { bracketIndexForWeight, supplierCost } from "@/lib/shipping/tariffs";

/*
 * Du chiffre d'affaires au revenu réel. Une vente encaisse `totals.total` ; il en faut
 * retirer les cotisations URSSAF, la commission du paiement, la fabrication des livres,
 * l'emballage du colis et le port RÉELLEMENT payé chez Boxtal — qui n'est pas le port
 * facturé au client : on facture un peu plus, d'où une marge sur le port.
 *
 * Les taux viennent des réglages en points de base (1 230 = 12,30 %), les montants
 * restent des entiers en centimes. Fonctions pures : ni base ni réseau, donc testables.
 */

/** Part d'un montant, en points de base. 3000 à 1230 bp → 369. */
export function partOf(cents: number, bp: number): number {
  return Math.round((cents * bp) / 10_000);
}

/*
 * Coût réel du port pour une commande : barème fournisseur Boxtal (TTC) au croisement du
 * transporteur choisi, du pays de destination et de la tranche de poids du colis.
 *
 * `known: false` quand on ne sait pas (commande sans mode de livraison, transporteur
 * absent du barème, expédition manuelle) : on retombe alors sur le port facturé, ce qui
 * revient à supposer une marge nulle plutôt qu'à s'inventer un bénéfice.
 */
export function shippingCostFor(order: Order, settings: SiteSettings): { cents: number; known: boolean } {
  const rateId = order.delivery?.rateId;
  const weightG = Math.round(parcelWeightKg(order, settings) * 1000);
  const cost = rateId ? supplierCost(rateId, order.shippingAddress.country, bracketIndexForWeight(weightG)) : undefined;
  if (cost === undefined) return { cents: order.totals.shipping, known: false };
  return { cents: cost, known: true };
}

export type OrderRevenue = {
  order: Order;
  /** Encaissé, port compris : c'est la base des cotisations et de la commission. */
  revenue: number;
  /** Part « livres » de l'encaissement (encaissé moins le port facturé). */
  goods: number;
  shippingCharged: number;
  shippingCost: number;
  /** Marge dégagée sur le port : facturé − réel (négative quand le port est offert). */
  shippingMargin: number;
  shippingKnown: boolean;
  /** Exemplaires expédiés, cadeaux compris : ils coûtent autant à fabriquer. */
  books: number;
  urssaf: number;
  stripeFee: number;
  bookCost: number;
  packagingCost: number;
  costs: number;
  net: number;
};

export function orderRevenue(order: Order, settings: SiteSettings, costs: Costs = settings.costs): OrderRevenue {
  const revenue = order.totals.total;
  const shippingCharged = order.totals.shipping;
  const ship = shippingCostFor(order, settings);
  const books = order.lines.reduce((s, l) => s + l.qty, 0);
  const urssaf = partOf(revenue, costs.urssafBp);
  const stripeFee = revenue > 0 ? partOf(revenue, costs.stripeBp) + costs.stripeFixed : 0;
  const bookCost = books * costs.bookCost;
  const total = urssaf + stripeFee + bookCost + costs.packagingCost + ship.cents;
  return {
    order,
    revenue,
    goods: Math.max(0, revenue - shippingCharged),
    shippingCharged,
    shippingCost: ship.cents,
    shippingMargin: shippingCharged - ship.cents,
    shippingKnown: ship.known,
    books,
    urssaf,
    stripeFee,
    bookCost,
    packagingCost: costs.packagingCost,
    costs: total,
    net: revenue - total,
  };
}

export type RevenueTotals = {
  orders: number;
  revenue: number;
  goods: number;
  shippingCharged: number;
  shippingCost: number;
  shippingMargin: number;
  books: number;
  urssaf: number;
  stripeFee: number;
  bookCost: number;
  packagingCost: number;
  costs: number;
  net: number;
  /** Commandes dont le port réel n'a pas pu être établi (estimé au port facturé). */
  unknownShipping: number;
};

export function sumRevenue(rows: OrderRevenue[]): RevenueTotals {
  const t: RevenueTotals = { orders: rows.length, revenue: 0, goods: 0, shippingCharged: 0, shippingCost: 0, shippingMargin: 0, books: 0, urssaf: 0, stripeFee: 0, bookCost: 0, packagingCost: 0, costs: 0, net: 0, unknownShipping: 0 };
  for (const r of rows) {
    t.revenue += r.revenue;
    t.goods += r.goods;
    t.shippingCharged += r.shippingCharged;
    t.shippingCost += r.shippingCost;
    t.shippingMargin += r.shippingMargin;
    t.books += r.books;
    t.urssaf += r.urssaf;
    t.stripeFee += r.stripeFee;
    t.bookCost += r.bookCost;
    t.packagingCost += r.packagingCost;
    t.costs += r.costs;
    t.net += r.net;
    if (!r.shippingKnown) t.unknownShipping += 1;
  }
  return t;
}

/** Taux de marge nette, en pourcentage du chiffre d'affaires ; null sans chiffre d'affaires. */
export function marginPct(t: Pick<RevenueTotals, "revenue" | "net">): number | null {
  return t.revenue > 0 ? (t.net / t.revenue) * 100 : null;
}
