import { describe, expect, it } from "vitest";
import { marginPct, orderRevenue, shippingCostFor, sumRevenue } from "./revenue";
import { DEFAULT_PARCEL, DEFAULT_SHIPPING_RATES, EMPTY_SENDER, Order, SiteSettings } from "@/lib/domain/types";

/*
 * Revenus réels : les coûts sont fixés ici pour que les chiffres attendus soient
 * vérifiables à la main. Le port réel vient du barème Boxtal (SUPPLIER_COST_TTC).
 */
const settings = SiteSettings.parse({
  shopName: "Mon Vrai",
  shipping: { freeThreshold: 3000, countries: ["FR"], rates: DEFAULT_SHIPPING_RATES, parcel: DEFAULT_PARCEL, sender: EMPTY_SENDER },
  costs: { urssafBp: 1230, bookCost: 400, packagingCost: 50, stripeBp: 150, stripeFixed: 25 },
  updatedAt: 1,
});

const base = {
  id: "ord_1",
  number: "MV-2026-00042",
  status: "paid",
  lines: [{ productSlug: "les-fruits", title: "Les fruits", qty: 2, unitPrice: 1500, preorder: false }],
  totals: { subtotal: 3000, shipping: 500, discount: 0, tax: 0, total: 3500, currency: "eur" },
  email: "camille@exemple.fr",
  shippingAddress: { name: "Camille Dupont", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR" },
  delivery: { rateId: "mondial-relay", rateName: "Mondial Relay - point relais", offerCode: "MONR-CpourToi" },
  stripe: { paymentIntentId: "pi_1" },
  timeline: [{ at: 1, status: "paid" }],
  createdAt: 1,
  updatedAt: 1,
};

const order = (patch: Record<string, unknown> = {}) => Order.parse({ ...base, ...patch });

describe("Revenus - coût réel du port", () => {
  it("prend la tranche de poids du barème Boxtal", () => {
    // 2 livres à 100 g + 60 g d'emballage = 260 g → tranche « jusqu'à 500 g » → 377.
    expect(shippingCostFor(order(), settings)).toEqual({ cents: 377, known: true });
  });

  it("suit le pays de destination", () => {
    const belge = order({ shippingAddress: { ...base.shippingAddress, country: "BE" } });
    expect(shippingCostFor(belge, settings)).toEqual({ cents: 426, known: true });
  });

  it("retombe sur le port facturé quand le transporteur est hors barème", () => {
    const manuel = order({ delivery: { rateId: "retrait-main-propre", rateName: "Remise en main propre", offerCode: "" } });
    expect(shippingCostFor(manuel, settings)).toEqual({ cents: 500, known: false });
  });
});

describe("Revenus - décomposition d'une commande", () => {
  it("retire cotisations, commission, fabrication, emballage et port réel", () => {
    const r = orderRevenue(order(), settings);
    expect(r.revenue).toBe(3500);
    expect(r.goods).toBe(3000);
    expect(r.urssaf).toBe(431); // 12,30 % de 35,00 €
    expect(r.stripeFee).toBe(78); // 1,50 % de 35,00 € + 0,25 €
    expect(r.bookCost).toBe(800); // 2 livres à 4,00 €
    expect(r.packagingCost).toBe(50);
    expect(r.shippingCost).toBe(377);
    expect(r.shippingMargin).toBe(123); // 5,00 € facturés − 3,77 € payés
    expect(r.costs).toBe(431 + 78 + 800 + 50 + 377);
    expect(r.net).toBe(3500 - r.costs);
  });

  it("compte les livres offerts dans la fabrication", () => {
    const r = orderRevenue(order({ lines: [...base.lines, { productSlug: "le-visage", title: "Le Visage", qty: 1, unitPrice: 0, gift: true }] }), settings);
    expect(r.books).toBe(3);
    expect(r.bookCost).toBe(1200);
  });

  it("laisse une marge de port négative quand la livraison est offerte", () => {
    const r = orderRevenue(order({ totals: { ...base.totals, shipping: 0, total: 3000 } }), settings);
    expect(r.shippingCharged).toBe(0);
    expect(r.shippingMargin).toBe(-377);
  });
});

describe("Revenus - cumul", () => {
  it("additionne les commandes et signale les ports inconnus", () => {
    const rows = [orderRevenue(order(), settings), orderRevenue(order({ id: "ord_2", delivery: { rateId: "inconnu", rateName: "?", offerCode: "" } }), settings)];
    const t = sumRevenue(rows);
    expect(t.orders).toBe(2);
    expect(t.revenue).toBe(7000);
    expect(t.books).toBe(4);
    expect(t.unknownShipping).toBe(1);
    expect(t.net).toBe(rows[0].net + rows[1].net);
    expect(marginPct(t)).toBeCloseTo((t.net / 7000) * 100, 6);
  });

  it("ne divise pas par zéro sans vente", () => {
    expect(marginPct(sumRevenue([]))).toBeNull();
  });
});
