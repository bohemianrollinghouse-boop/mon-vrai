import type { Influencer, Order, RefClicks } from "@/lib/domain/types";
import { countedOrders, merchandise } from "./stats";

/*
 * Vue de l'espace partenaire : ce qu'un influenceur voit de ses propres résultats.
 * Module pur — la page passe les listes, on rend des chiffres — donc testable sans
 * base (partner.test.ts).
 *
 * Deux règles le gouvernent :
 *  - la commission est facultative. Sans elle, `commission` vaut null (et non zéro) :
 *    un zéro se serait affiché, laissant entendre qu'il y a quelque chose à gagner.
 *  - l'acheteur reste anonyme. On ne sort que le numéro, la date, le canal et le
 *    montant des livres — jamais un nom, une adresse ou une adresse e-mail.
 */

export type PartnerPeriod = "30" | "90" | "tout";

export const PARTNER_PERIODS: { key: PartnerPeriod; label: string }[] = [
  { key: "30", label: "30 jours" },
  { key: "90", label: "90 jours" },
  { key: "tout", label: "Depuis le début" },
];

export type PartnerDay = { day: string; code: number; link: number };
export type PartnerRecent = { number: string; createdAt: number; via: "code" | "link"; merchandise: number; commission: number | null };

export type PartnerView = {
  orders: number;
  byCode: number;
  byLink: number;
  /** CA attribué (livres seuls, hors port), en centimes. */
  revenue: number;
  /** Commission due, en centimes. `null` quand le partenaire n'est pas commissionné. */
  commission: number | null;
  clicks: number;
  /** Commandes pour 100 clics, à une décimale. */
  conversion: number;
  days: PartnerDay[];
  recent: PartnerRecent[];
};

const DAY = 86_400_000;
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Début de la fenêtre, ou undefined pour « depuis le début ». */
export function periodStart(period: PartnerPeriod, now: number): number | undefined {
  if (period === "30") return now - 30 * DAY;
  if (period === "90") return now - 90 * DAY;
  return undefined;
}

export function partnerView(influencer: Influencer, orders: Order[], clicks: RefClicks[], now: number, period: PartnerPeriod = "30"): PartnerView {
  const since = periodStart(period, now);
  const mine = countedOrders(orders, since).filter((o) => o.attribution?.influencerId === influencer.id);

  const byCode = mine.filter((o) => o.attribution?.via === "code").length;
  const revenue = mine.reduce((s, o) => s + merchandise(o), 0);
  const clicked = clicks
    .filter((c) => c.influencerId === influencer.id && (since === undefined || new Date(`${c.day}T23:59:59Z`).getTime() >= since))
    .reduce((s, c) => s + c.count, 0);

  /*
   * Le graphique compte les jours depuis la première vente quand la fenêtre est
   * ouverte : dessiner depuis la création du partenaire donnerait une longue plage
   * vide sans rien apprendre.
   */
  const first = mine.length > 0 ? Math.min(...mine.map((o) => o.createdAt)) : now;
  const from = since ?? first;
  const span = Math.max(1, Math.min(180, Math.ceil((now - from) / DAY) + 1));
  const buckets = new Map<string, PartnerDay>();
  for (let i = 0; i < span; i++) {
    const key = dayKey(from + i * DAY);
    buckets.set(key, { day: key, code: 0, link: 0 });
  }
  for (const o of mine) {
    const b = buckets.get(dayKey(o.createdAt));
    if (!b) continue;
    if (o.attribution?.via === "code") b.code += 1;
    else b.link += 1;
  }
  const daily = [...buckets.values()];
  // Au-delà d'un mois, une barre par jour devient illisible : on regroupe par semaine.
  const days = daily.length > 31 ? groupByWeek(daily) : daily;

  const commission = influencer.commission ? Math.round((revenue * influencer.rate) / 100) : null;

  const recent = [...mine]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((o) => {
      const amount = merchandise(o);
      return {
        number: o.number,
        createdAt: o.createdAt,
        via: (o.attribution?.via ?? "link") as "code" | "link",
        merchandise: amount,
        commission: influencer.commission ? Math.round((amount * influencer.rate) / 100) : null,
      };
    });

  return {
    orders: mine.length,
    byCode,
    byLink: mine.length - byCode,
    revenue,
    commission,
    clicks: clicked,
    conversion: clicked > 0 ? Math.round((mine.length / clicked) * 1000) / 10 : 0,
    days,
    recent,
  };
}

function groupByWeek(daily: PartnerDay[]): PartnerDay[] {
  const out: PartnerDay[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const week = daily.slice(i, i + 7);
    out.push({ day: week[0].day, code: week.reduce((s, d) => s + d.code, 0), link: week.reduce((s, d) => s + d.link, 0) });
  }
  return out;
}
