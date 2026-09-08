import type { Influencer, Order, Promo, RefClicks } from "@/lib/domain/types";

/*
 * Statistiques des campagnes, calculées à partir des commandes (source de vérité) et
 * des compteurs de clics. Pures : l'admin passe les listes, on rend des chiffres.
 * CA attribué = marchandises (sous-total − remise), hors port ; en franchise de TVA,
 * HT = TTC, donc la commission s'applique à ce montant.
 */

export const COUNTED_STATUSES: Order["status"][] = ["paid", "preparing", "shipped", "delivered"];

export function merchandise(o: Order): number {
  return Math.max(0, o.totals.subtotal - o.totals.discount);
}

export function countedOrders(orders: Order[], since?: number): Order[] {
  return orders.filter((o) => o.livemode && COUNTED_STATUSES.includes(o.status) && (since === undefined || o.createdAt >= since));
}

export type InfluencerStats = {
  influencer: Influencer;
  orders: number;
  byCode: number;
  byLink: number;
  revenue: number;
  commission: number;
  clicks: number;
  conversion: number;
  /** 14 derniers jours : ventes par jour, code / lien. */
  spark: { day: string; code: number; link: number }[];
  recent: { order: Order; via: "code" | "link" }[];
};

export function influencerStats(influencers: Influencer[], orders: Order[], clicks: RefClicks[], now: number, days = 30): { rows: InfluencerStats[]; totals: { revenue: number; orders: number; byCode: number; byLink: number; clicks: number; commission: number; share: number; conversion: number } } {
  const since = now - days * 86_400_000;
  const counted = countedOrders(orders, since);
  const totalRevenue = counted.reduce((s, o) => s + merchandise(o), 0);
  const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const sparkDays = Array.from({ length: 14 }, (_, i) => dayKey(now - (13 - i) * 86_400_000));

  const rows: InfluencerStats[] = influencers.map((inf) => {
    const mine = counted.filter((o) => o.attribution?.influencerId === inf.id);
    const byCode = mine.filter((o) => o.attribution?.via === "code").length;
    const byLink = mine.length - byCode;
    const revenue = mine.reduce((s, o) => s + merchandise(o), 0);
    const clickCount = clicks.filter((c) => c.influencerId === inf.id && c.day >= dayKey(since)).reduce((s, c) => s + c.count, 0);
    const spark = sparkDays.map((day) => ({
      day,
      code: mine.filter((o) => dayKey(o.createdAt) === day && o.attribution?.via === "code").length,
      link: mine.filter((o) => dayKey(o.createdAt) === day && o.attribution?.via === "link").length,
    }));
    return {
      influencer: inf,
      orders: mine.length,
      byCode,
      byLink,
      revenue,
      commission: Math.round((revenue * inf.rate) / 100),
      clicks: clickCount,
      conversion: clickCount ? mine.length / clickCount : 0,
      spark,
      recent: mine.slice(0, 4).map((o) => ({ order: o, via: o.attribution?.via ?? "link" })),
    };
  });

  const totals = rows.reduce(
    (t, r) => ({ ...t, revenue: t.revenue + r.revenue, orders: t.orders + r.orders, byCode: t.byCode + r.byCode, byLink: t.byLink + r.byLink, clicks: t.clicks + r.clicks, commission: t.commission + r.commission }),
    { revenue: 0, orders: 0, byCode: 0, byLink: 0, clicks: 0, commission: 0, share: 0, conversion: 0 },
  );
  totals.share = totalRevenue ? totals.revenue / totalRevenue : 0;
  totals.conversion = totals.clicks ? totals.orders / totals.clicks : 0;
  return { rows, totals };
}

export type PromoStats = { uses: number; revenue: number };

/** Utilisations et CA par code, d'après les commandes comptées. */
export function promoStats(promos: Promo[], orders: Order[]): Map<string, PromoStats> {
  const counted = countedOrders(orders);
  const map = new Map<string, PromoStats>();
  for (const p of promos) {
    const mine = counted.filter((o) => o.promoCodes.includes(p.code));
    map.set(p.code, { uses: Math.max(p.uses, mine.length), revenue: mine.reduce((s, o) => s + merchandise(o), 0) });
  }
  return map;
}
