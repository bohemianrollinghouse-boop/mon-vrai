import { describe, expect, it } from "vitest";
import { Influencer, type Order, type RefClicks } from "@/lib/domain/types";
import { partnerView } from "./partner";

const NOW = Date.UTC(2026, 8, 11, 12);
const DAY = 86_400_000;

const inf = (over: Partial<Influencer> = {}) =>
  Influencer.parse({ id: "inf_1", name: "Marie", slug: "marie", code: "MARIE10", discount: 10, rate: 10, createdAt: 1, updatedAt: 1, ...over });

/* Une commande attribuée, réduite à ce que la vue lit. */
const order = (daysAgo: number, via: "code" | "link", subtotal: number, over: Partial<Order> = {}) =>
  ({
    number: `#${1000 + daysAgo}`,
    createdAt: NOW - daysAgo * DAY,
    status: "paid",
    livemode: true,
    attribution: { influencerId: "inf_1", via },
    totals: { subtotal, discount: 0, shipping: 500, total: subtotal + 500 },
    ...over,
  }) as unknown as Order;

const clicks = (count: number, daysAgo = 1): RefClicks[] => [{ influencerId: "inf_1", day: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10), count }];

describe("partnerView", () => {
  it("compte les ventes attribuées et sépare code et lien", () => {
    const v = partnerView(inf(), [order(1, "code", 3000), order(2, "link", 2000)], [], NOW);
    expect(v.orders).toBe(2);
    expect(v.byCode).toBe(1);
    expect(v.byLink).toBe(1);
    expect(v.revenue).toBe(5000);
  });

  it("ignore les commandes d'un autre partenaire", () => {
    const other = order(1, "code", 9999, { attribution: { influencerId: "inf_2", via: "code" } } as Partial<Order>);
    expect(partnerView(inf(), [order(1, "code", 1000), other], [], NOW).orders).toBe(1);
  });

  it("ignore les commandes de test et les non encaissées", () => {
    const test = order(1, "code", 5000, { livemode: false } as Partial<Order>);
    const pending = order(1, "code", 5000, { status: "pending_payment" } as Partial<Order>);
    expect(partnerView(inf(), [test, pending], [], NOW).orders).toBe(0);
  });

  it("ne rend aucune commission quand le partenaire n'en a pas", () => {
    const v = partnerView(inf({ commission: false }), [order(1, "code", 5000)], [], NOW);
    expect(v.commission).toBeNull();
    expect(v.recent.every((r) => r.commission === null)).toBe(true);
  });

  it("distingue « pas de commission » de « commission nulle »", () => {
    // Zéro pour cent est un taux ; absent de commission est autre chose.
    expect(partnerView(inf({ commission: true, rate: 0 }), [order(1, "code", 5000)], [], NOW).commission).toBe(0);
    expect(partnerView(inf({ commission: false, rate: 0 }), [order(1, "code", 5000)], [], NOW).commission).toBeNull();
  });

  it("calcule la commission sur les livres, hors port", () => {
    const v = partnerView(inf({ commission: true, rate: 10 }), [order(1, "code", 5000)], [], NOW);
    expect(v.commission).toBe(500);
    expect(v.recent[0].commission).toBe(500);
  });

  it("respecte la fenêtre choisie", () => {
    const orders = [order(5, "code", 1000), order(45, "code", 1000), order(200, "code", 1000)];
    expect(partnerView(inf(), orders, [], NOW, "30").orders).toBe(1);
    expect(partnerView(inf(), orders, [], NOW, "90").orders).toBe(2);
    expect(partnerView(inf(), orders, [], NOW, "tout").orders).toBe(3);
  });

  it("calcule le taux de conversion à partir des clics", () => {
    const v = partnerView(inf(), [order(1, "code", 1000)], clicks(20), NOW);
    expect(v.clicks).toBe(20);
    expect(v.conversion).toBe(5);
  });

  it("ne divise pas par zéro sans clic", () => {
    expect(partnerView(inf(), [order(1, "code", 1000)], [], NOW).conversion).toBe(0);
  });

  it("regroupe par semaine au-delà d'un mois", () => {
    const v = partnerView(inf(), [order(1, "code", 1000)], [], NOW, "90");
    expect(v.days.length).toBeLessThanOrEqual(14);
    expect(partnerView(inf(), [order(1, "code", 1000)], [], NOW, "30").days.length).toBe(31);
  });

  it("n'expose que le numéro, la date, le canal et le montant", () => {
    const v = partnerView(inf(), [order(1, "code", 3000)], [], NOW);
    expect(Object.keys(v.recent[0]).sort()).toEqual(["commission", "createdAt", "merchandise", "number", "via"]);
  });
});
