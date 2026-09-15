import type { Expense, ExpenseCategory, ExpenseRecurrence } from "@/lib/domain/types";

/*
 * Ce que deviennent les mouvements : totaux, poste par poste, mois par mois, charges
 * fixes et coût rattaché à un titre. Fonctions pures, sans base ni réseau : l'écran se
 * contente de les afficher, et elles se testent seules.
 *
 * Deux sources se rejoignent ici. Les lignes SAISIES à la main (les frais, et les
 * entrées d'un autre bord : apport, subvention, remboursement) ; et les VENTES du site,
 * qui ne se saisissent pas — elles sont déduites des commandes encaissées, et elles
 * emportent avec elles les cotisations URSSAF, prélevées sur chaque encaissement.
 *
 * Convention : les montants saisis sont positifs en base, le sens vient de `direction`.
 * Une sortie « engagée » (facture reçue, pas encore payée) est comptée à part — elle
 * pèsera sur la trésorerie, mais elle n'est pas encore sortie du compte.
 */

export type ExpenseTotals = {
  count: number;
  /** Sorties réellement payées. */
  out: number;
  /** Entrées encaissées (hors ventes du site). */
  in: number;
  /** Sorties engagées non encore payées. */
  pending: number;
  /** Entrées − sorties payées. Négatif la plupart du temps : c'est normal. */
  net: number;
};

/*
 * Ce que les commandes du site font entrer, et ce que l'URSSAF y prélève aussitôt. Le
 * taux vient des réglages (`costs.urssafBp`, 12,30 % par défaut) et la retenue se
 * calcule commande par commande, comme dans /admin/revenus — pas sur le total du mois,
 * sans quoi les deux écrans ne tomberaient pas sur le même chiffre.
 */
export type SalesFlow = {
  /** Commandes encaissées (hors kits offerts, qui n'encaissent rien). */
  orders: number;
  /** Encaissé, port compris : c'est l'assiette des cotisations. */
  revenue: number;
  urssaf: number;
};

export const NO_SALES: SalesFlow = { orders: 0, revenue: 0, urssaf: 0 };

export function sumSales(list: SalesFlow[]): SalesFlow {
  return list.reduce((t, s) => ({ orders: t.orders + s.orders, revenue: t.revenue + s.revenue, urssaf: t.urssaf + s.urssaf }), NO_SALES);
}

/*
 * La trésorerie d'ensemble : les ventes et les lignes saisies dans le même compte.
 * `out` porte les cotisations en plus des frais payés — c'est bien de l'argent qui part,
 * et le plus gros poste la plupart des mois.
 */
export type CashTotals = {
  /** Lignes saisies à la main sur la période. */
  entered: ExpenseTotals;
  /** Ventes du site sur la même période. */
  sales: SalesFlow;
  /** Tout ce qui entre : ventes + entrées saisies. */
  in: number;
  /** Tout ce qui sort : cotisations + frais payés. */
  out: number;
  /** Sorties engagées, pas encore payées : à part, elles n'ont pas quitté le compte. */
  pending: number;
  net: number;
};

export function cashTotals(list: Expense[], sales: SalesFlow = NO_SALES): CashTotals {
  const entered = sumExpenses(list);
  const cashIn = entered.in + sales.revenue;
  const cashOut = entered.out + sales.urssaf;
  return { entered, sales, in: cashIn, out: cashOut, pending: entered.pending, net: cashIn - cashOut };
}

export function sumExpenses(list: Expense[]): ExpenseTotals {
  const t: ExpenseTotals = { count: list.length, out: 0, in: 0, pending: 0, net: 0 };
  for (const e of list) {
    if (e.direction === "in") t.in += e.status === "paid" ? e.amount : 0;
    else if (e.status === "paid") t.out += e.amount;
    else t.pending += e.amount;
  }
  t.net = t.in - t.out;
  return t;
}

/** Les lignes dont le jour tombe dans [from, to], bornes comprises. `from` vide = depuis le début. */
export function inPeriod(list: Expense[], from: string, to: string): Expense[] {
  return list.filter((e) => (!from || e.date >= from) && e.date <= to);
}

/** « 2026-09-15 » moins 30 jours. Passe par UTC : aucune heure d'été à rattraper. */
export function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export type CategoryTotal = { category: ExpenseCategory; amount: number; count: number };

/** Poste par poste, du plus lourd au plus léger. Un seul sens à la fois. */
export function byCategory(list: Expense[], direction: "out" | "in" = "out"): CategoryTotal[] {
  const map = new Map<ExpenseCategory, CategoryTotal>();
  for (const e of list) {
    if (e.direction !== direction) continue;
    const row = map.get(e.category) ?? { category: e.category, amount: 0, count: 0 };
    row.amount += e.amount;
    row.count += 1;
    map.set(e.category, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export type MonthTotal = { month: string } & CashTotals;

/*
 * Mois par mois, du plus récent au plus ancien. Un mois n'existe que s'il a vu quelque
 * chose : une ligne saisie OU une vente — d'où l'union des deux jeux de clés, sinon un
 * mois sans frais mais plein de ventes n'apparaîtrait pas du tout.
 */
export function byMonth(list: Expense[], sales: Map<string, SalesFlow> = new Map()): MonthTotal[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    const key = e.date.slice(0, 7);
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  const months = new Set([...map.keys(), ...sales.keys()]);
  return [...months].sort((a, b) => b.localeCompare(a)).map((month) => ({ month, ...cashTotals(map.get(month) ?? [], sales.get(month) ?? NO_SALES) }));
}

/** Ce que pèse un frais récurrent sur un mois. Un frais ponctuel ne pèse rien de fixe. */
export function monthlyCost(amount: number, recurrence: ExpenseRecurrence): number {
  if (recurrence === "monthly") return amount;
  if (recurrence === "quarterly") return Math.round(amount / 3);
  if (recurrence === "yearly") return Math.round(amount / 12);
  return 0;
}

export type FixedCharge = { key: string; label: string; supplier: string; recurrence: ExpenseRecurrence; amount: number; monthly: number; date: string };

/*
 * Les charges fixes, ramenées au mois. Un abonnement est saisi à CHAQUE paiement : trois
 * ans d'assurance annuelle font trois lignes, qui décrivent pourtant une seule charge.
 * On ne retient donc que la dernière occurrence de chaque frais récurrent — même poste,
 * même libellé, même fournisseur —, et c'est elle qui donne la charge courante.
 */
export function fixedCharges(list: Expense[]): FixedCharge[] {
  const map = new Map<string, Expense>();
  for (const e of list) {
    if (e.direction !== "out" || e.recurrence === "once") continue;
    const key = `${e.category}|${e.label.trim().toLowerCase()}|${e.supplier.trim().toLowerCase()}`;
    const kept = map.get(key);
    if (!kept || e.date > kept.date) map.set(key, e);
  }
  return [...map.entries()]
    .map(([key, e]) => ({ key, label: e.label, supplier: e.supplier, recurrence: e.recurrence, amount: e.amount, monthly: monthlyCost(e.amount, e.recurrence), date: e.date }))
    .sort((a, b) => b.monthly - a.monthly);
}

export const fixedMonthly = (list: Expense[]): number => fixedCharges(list).reduce((s, c) => s + c.monthly, 0);

export type ProductCost = { slug: string; amount: number; count: number; units: number; perUnit: number | null };

/*
 * Ce qu'un titre a coûté avant d'exister : sa norme CE, ses essais, son tirage. Le coût
 * par exemplaire ne se calcule que sur les lignes où le nombre d'exemplaires couverts a
 * été saisi — sinon on rapporterait un tirage entier à un exemplaire.
 */
export function byProduct(list: Expense[]): ProductCost[] {
  const map = new Map<string, ProductCost>();
  for (const e of list) {
    if (e.direction !== "out" || !e.productSlug) continue;
    const row = map.get(e.productSlug) ?? { slug: e.productSlug, amount: 0, count: 0, units: 0, perUnit: null };
    row.amount += e.amount;
    row.count += 1;
    row.units += e.units;
    map.set(e.productSlug, row);
  }
  for (const row of map.values()) {
    const covered = list.filter((e) => e.direction === "out" && e.productSlug === row.slug && e.units > 0);
    const coveredAmount = covered.reduce((s, e) => s + e.amount, 0);
    const coveredUnits = covered.reduce((s, e) => s + e.units, 0);
    row.perUnit = coveredUnits > 0 ? Math.round(coveredAmount / coveredUnits) : null;
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
