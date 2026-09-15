import type { Expense, ExpenseCategory, ExpenseRecurrence } from "@/lib/domain/types";

/*
 * Ce que deviennent les mouvements saisis : totaux, poste par poste, mois par mois,
 * charges fixes et coût rattaché à un titre. Fonctions pures, sans base ni réseau :
 * l'écran se contente de les afficher, et elles se testent seules.
 *
 * Convention : les montants sont positifs en base, le sens vient de `direction`. Une
 * sortie « engagée » (facture reçue, pas encore payée) est comptée à part — elle pèsera
 * sur la trésorerie, mais elle n'est pas encore sortie du compte.
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

export type MonthTotal = { month: string } & ExpenseTotals;

/** Mois par mois, du plus récent au plus ancien. */
export function byMonth(list: Expense[]): MonthTotal[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    const key = e.date.slice(0, 7);
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, rows]) => ({ month, ...sumExpenses(rows) }));
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
