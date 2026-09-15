import type { Expense, ExpenseCategory, ExpenseRecurrence } from "@/lib/domain/types";
import { partOf } from "./revenue";

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
  /** Encaissé, port compris : c'est l'assiette des cotisations et de la commission. */
  revenue: number;
  urssaf: number;
  /*
   * Commission Stripe, part variable + part fixe par transaction. Elle ne concerne QUE
   * les ventes du site : une vente en salon réglée en espèces ou par virement ne passe
   * pas par Stripe et ne coûte rien.
   */
  stripeFee: number;
};

export const NO_SALES: SalesFlow = { orders: 0, revenue: 0, urssaf: 0, stripeFee: 0 };

export function sumSales(list: SalesFlow[]): SalesFlow {
  return list.reduce((t, s) => ({ orders: t.orders + s.orders, revenue: t.revenue + s.revenue, urssaf: t.urssaf + s.urssaf, stripeFee: t.stripeFee + s.stripeFee }), NO_SALES);
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
  /** Chiffre d'affaires saisi à la main : cotisable au même titre qu'une vente. */
  enteredTurnover: number;
  /** Cotisations sur TOUT le chiffre d'affaires de la période, saisi et encaissé en ligne. */
  urssaf: number;
  /** Commission de paiement retenue par Stripe sur les ventes du site. */
  stripeFee: number;
  /** Tout ce qui entre : ventes + entrées saisies. */
  in: number;
  /** Tout ce qui sort : cotisations, commission de paiement, et frais payés. */
  out: number;
  /** Sorties engagées, pas encore payées : à part, elles n'ont pas quitté le compte. */
  pending: number;
  net: number;
};

/*
 * `urssafBp` à 0 ne retient rien : c'est le cas des appels qui ne s'intéressent qu'aux
 * montants bruts. Les cotisations des ventes du site arrivent déjà calculées dans
 * `sales`, commande par commande ; celles des entrées saisies s'additionnent ici ligne
 * par ligne, pour la même raison — ce qu'on affiche à côté de chaque montant doit faire
 * le total, au centime.
 */
/*
 * Ce que l'URSSAF prend sur UN mouvement. Zéro dès qu'il n'est pas une recette encaissée :
 * une sortie ne cotise rien, une entrée pas encore encaissée non plus, et un don ou un
 * apport a vu sa case décochée à la saisie.
 *
 * C'est cette fonction qui s'affiche ligne par ligne dans la liste ET qui compose le
 * total : les deux ne peuvent donc pas se contredire, même d'un centime — ce qui
 * arriverait en appliquant le taux à la somme plutôt qu'à chaque ligne.
 */
export function urssafOn(e: Expense, bp: number): number {
  return e.direction === "in" && e.status === "paid" && e.taxable ? partOf(e.amount, bp) : 0;
}

export function cashTotals(list: Expense[], sales: SalesFlow = NO_SALES, urssafBp = 0): CashTotals {
  const entered = sumExpenses(list);
  const enteredTurnover = list.filter((e) => e.direction === "in" && e.status === "paid" && e.taxable).reduce((s, e) => s + e.amount, 0);
  const urssaf = sales.urssaf + list.reduce((sum, e) => sum + urssafOn(e, urssafBp), 0);
  const cashIn = entered.in + sales.revenue;
  const cashOut = entered.out + urssaf + sales.stripeFee;
  return { entered, sales, enteredTurnover, urssaf, stripeFee: sales.stripeFee, in: cashIn, out: cashOut, pending: entered.pending, net: cashIn - cashOut };
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
export function byMonth(list: Expense[], sales: Map<string, SalesFlow> = new Map(), urssafBp = 0): MonthTotal[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    const key = e.date.slice(0, 7);
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  const months = new Set([...map.keys(), ...sales.keys()]);
  return [...months].sort((a, b) => b.localeCompare(a)).map((month) => ({ month, ...cashTotals(map.get(month) ?? [], sales.get(month) ?? NO_SALES, urssafBp) }));
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

export type ProductCost = { slug: string; amount: number; count: number; shared: number };

/*
 * Répartit un montant entre n parts, en centimes entiers dont la somme fait exactement
 * le montant : les premières parts reçoivent le centime qui reste. 1 000 ÷ 3 donne donc
 * 334, 333, 333 — et non trois fois 333,33 qu'on ne saurait pas écrire.
 */
export function splitCents(amount: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(amount / parts);
  const extra = amount - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/*
 * Ce qu'un titre a coûté avant d'exister : sa norme CE, ses essais, son tirage.
 *
 * Un frais qui couvre PLUSIEURS titres — une série d'essais passée d'un coup, une
 * commande d'ISBN — se répartit entre eux à parts égales. Le compter en entier pour
 * chacun gonflerait le total de la colonne au point de la rendre insommable ; le
 * répartir garde la somme juste. `shared` dit combien de ces lignes étaient partagées,
 * pour que l'écran puisse le signaler plutôt que de laisser croire à un montant exact.
 */
export function byProduct(list: Expense[]): ProductCost[] {
  const map = new Map<string, ProductCost>();
  for (const e of list) {
    if (e.direction !== "out" || e.productSlugs.length === 0) continue;
    const parts = splitCents(e.amount, e.productSlugs.length);
    e.productSlugs.forEach((slug, i) => {
      const row = map.get(slug) ?? { slug, amount: 0, count: 0, shared: 0 };
      row.amount += parts[i];
      row.count += 1;
      if (e.productSlugs.length > 1) row.shared += 1;
      map.set(slug, row);
    });
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
