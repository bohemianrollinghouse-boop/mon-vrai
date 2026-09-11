import type { Influencer, InfluencerStatement, Order } from "@/lib/domain/types";
import { countedOrders, merchandise } from "./stats";

/*
 * Relevés mensuels de commission.
 *
 * Ils ne sont pas « clôturés » par une tâche mensuelle : ils se déduisent des commandes,
 * ce qui évite toute dérive entre ce qui est affiché et ce qui s'est réellement vendu.
 * Seul le PAIEMENT est stocké — et avec lui un instantané des montants versés, pour
 * qu'un remboursement survenu après coup ne réécrive pas un relevé déjà payé.
 *
 * Un remboursement ne fait JAMAIS disparaître une ligne : une vente qui s'efface sans
 * explication est incompréhensible pour le partenaire. La vente reste donc comptée, et
 * une REPRISE négative vient l'annuler, en nommant la commande concernée.
 *
 * Sur quel mois pèse la reprise : sur le mois d'origine s'il n'a pas encore été versé
 * (rien n'est parti, on régularise sur place), sur le mois en cours s'il l'a été — on
 * ne réécrit pas un relevé payé. Dans ce second cas elle se fait au taux réellement
 * appliqué, qui n'est pas forcément celui d'aujourd'hui, et elle est mémorisée sur le
 * relevé qui l'absorbe : sans quoi elle serait redéduite tous les mois suivants.
 *
 * Module pur (statements.test.ts).
 */

/** Reprise d'une commission versée puis remboursée. `amount` est négatif. */
export type Clawback = { orderNumber: string; month: string; amount: number };

export type StatementRow = {
  /** Mois au format AAAA-MM. */
  month: string;
  orders: number;
  revenue: number;
  /** Commission du mois, reprises comprises. Peut être négative. */
  commission: number;
  /** Commission des ventes du mois, avant reprises. */
  earned: number;
  status: "current" | "pending" | "paid";
  paidAt?: number;
  /** Reprises portées par ce mois (mois en cours uniquement). */
  clawbacks: Clawback[];
};

const monthKey = (ts: number) => new Date(ts).toISOString().slice(0, 7);

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Les relevés d'un partenaire, du plus récent au plus ancien.
 * @param stored Relevés déjà payés ; ils font foi sur les montants.
 */
export function statementRows(influencer: Influencer, orders: Order[], stored: InfluencerStatement[], now: number): StatementRow[] {
  if (!influencer.commission) return [];

  const attributed = orders.filter((o) => o.attribution?.influencerId === influencer.id);
  const refunded = attributed.filter((o) => o.livemode && (o.status === "refunded" || o.status === "cancelled"));
  /*
   * Les ventes remboursées restent comptées dans le mois où elles ont eu lieu : c'est
   * la reprise qui les annule, visiblement, et non leur disparition.
   */
  const mine = [...countedOrders(attributed), ...refunded];
  const current = monthKey(now);
  const byMonth = new Map<string, { orders: number; revenue: number }>();
  for (const o of mine) {
    const key = monthKey(o.createdAt);
    const acc = byMonth.get(key) ?? { orders: 0, revenue: 0 };
    acc.orders += 1;
    acc.revenue += merchandise(o);
    byMonth.set(key, acc);
  }

  const paid = new Map(stored.filter((s) => s.status === "paid").map((s) => [s.month, s]));

  /*
   * Reprises en attente : une commande remboursée dont le mois d'origine a déjà été
   * versé, et qui n'a pas encore été déduite sur un relevé.
   */
  const settled = new Set(stored.flatMap((s) => s.clawedBack));
  /* Reprises rattachées au mois qui doit les porter. */
  const byTarget = new Map<string, Clawback[]>();
  for (const o of refunded) {
    if (settled.has(o.number)) continue;
    const month = monthKey(o.createdAt);
    const source = paid.get(month);
    // Mois déjà versé : au taux appliqué alors, sur le mois en cours. Sinon : sur place.
    const rate = source ? source.rate : influencer.rate;
    const target = source ? current : month;
    const entry = { orderNumber: o.number, month, amount: -Math.round((merchandise(o) * rate) / 100) };
    byTarget.set(target, [...(byTarget.get(target) ?? []), entry]);
  }
  // Un mois payé doit figurer même si toutes ses commandes ont depuis été annulées.
  for (const month of paid.keys()) if (!byMonth.has(month)) byMonth.set(month, { orders: 0, revenue: 0 });
  // Une reprise doit pouvoir s'inscrire même sans vente ce mois-là.
  for (const month of byTarget.keys()) if (!byMonth.has(month)) byMonth.set(month, { orders: 0, revenue: 0 });

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, acc]) => {
      const already = paid.get(month);
      if (already) {
        return {
          month,
          orders: already.orders,
          revenue: already.revenue,
          commission: already.commission,
          earned: already.commission,
          status: "paid" as const,
          paidAt: already.paidAt,
          clawbacks: [],
        };
      }
      const earned = Math.round((acc.revenue * influencer.rate) / 100);
      const mineHere = byTarget.get(month) ?? [];
      return {
        month,
        orders: acc.orders,
        revenue: acc.revenue,
        commission: earned + mineHere.reduce((s, c) => s + c.amount, 0),
        earned,
        status: month === current ? ("current" as const) : ("pending" as const),
        clawbacks: mineHere,
      };
    });
}

/*
 * IBAN masqué : les quatre premiers caractères (pays et clé) et les quatre derniers
 * suffisent à reconnaître son compte. Le reste ne s'affiche jamais, même à son
 * propriétaire — une capture d'écran de l'espace ne doit pas livrer un IBAN complet.
 */
export function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

/** Forme acceptable d'un IBAN : deux lettres de pays, deux chiffres de clé, puis 10 à 30 caractères. */
export function isIban(value: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value.replace(/\s+/g, "").toUpperCase());
}
