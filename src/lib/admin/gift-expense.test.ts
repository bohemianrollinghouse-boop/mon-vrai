import { describe, expect, it } from "vitest";
import { DEFAULT_PARCEL, DEFAULT_SHIPPING_RATES, EMPTY_SENDER, Order, SiteSettings } from "@/lib/domain/types";
import { giftExpenseId, giftLabelCost, giftLabelExpense } from "./gift-expense";

const settings = SiteSettings.parse({
  shopName: "Mon Vrai",
  contact: { email: "contact@monvrai.fr", addressLines: [] },
  shipping: { freeThreshold: 3000, countries: ["FR"], rates: DEFAULT_SHIPPING_RATES, parcel: DEFAULT_PARCEL, sender: { ...EMPTY_SENDER, company: "Mon Vrai" } },
  updatedAt: 1,
});

/** Un kit : trois imagiers offerts (360 g avec l'emballage), rien d'encaissé. */
const kit = Order.parse({
  id: "ord_kit1",
  number: "MV-2026-00042",
  status: "paid",
  lines: [
    { productSlug: "les-fruits", title: "Les fruits", qty: 2, unitPrice: 0, preorder: false },
    { productSlug: "le-visage", title: "Le Visage", qty: 1, unitPrice: 0, preorder: false },
  ],
  totals: { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0, currency: "eur" },
  email: "lea@exemple.fr",
  shippingAddress: { name: "Léa Martin", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR", phone: "0612345678" },
  delivery: { rateId: "mondial-relay", rateName: "Mondial Relay", offerCode: "MONR-CpourToi", relay: { code: "FR-123", name: "Tabac du centre" } },
  kit: { influencerId: "inf_1", stock: false, seq: 1 },
  timeline: [{ at: 1, status: "paid" }],
  createdAt: 1,
  updatedAt: 1,
});

describe("Dépense de l'étiquette d'un colis offert", () => {
  it("retient le prix annoncé par Boxtal, ramené au TTC", () => {
    expect(giftLabelCost(kit, settings, 4.56)).toEqual({ cents: 547, source: "boxtal" });
  });

  it("retombe sur le barème fournisseur quand Boxtal ne chiffre pas", () => {
    // 360 g → tranche « jusqu'à 500 g », Mondial Relay France.
    expect(giftLabelCost(kit, settings)).toEqual({ cents: 377, source: "bareme" });
  });

  it("laisse le montant à compléter quand le transporteur est hors barème", () => {
    const hors = Order.parse({ ...kit, delivery: { rateId: "colis-prive", rateName: "Colis Privé", offerCode: "COPR-CoprRelaisDomicileNat" } });
    expect(giftLabelCost(hors, settings)).toEqual({ cents: 0, source: "inconnu" });
    expect(giftLabelExpense(hors, settings, "Léa Martin", "2026-09-22").status).toBe("pending");
  });

  it("écrit une sortie au nom de l'influenceur, sous un identifiant déduit de la commande", () => {
    const e = giftLabelExpense(kit, settings, "Léa Martin", "2026-09-22", 4.56);
    expect(e).toMatchObject({
      id: giftExpenseId(kit),
      direction: "out",
      category: "shipping",
      label: "Étiquette kit — Léa Martin",
      supplier: "Boxtal",
      amount: 547,
      date: "2026-09-22",
      status: "paid",
      taxable: false,
      productSlugs: [],
    });
    expect(e.note).toBe("Kit MV-2026-00042 · Mondial Relay · 360 g · prix Boxtal, TTC");
  });

  it("nomme la commande à défaut de l'influenceur, et signale un kit qui n'est pas le premier", () => {
    const second = Order.parse({ ...kit, kit: { influencerId: "inf_1", stock: false, seq: 2 } });
    const e = giftLabelExpense(second, settings, "", "2026-09-22");
    expect(e.label).toBe("Étiquette kit — Léa Martin");
    expect(e.note).toContain("2e kit");
  });
});
