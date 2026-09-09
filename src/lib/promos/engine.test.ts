import { describe, expect, it } from "vitest";
import { applyPromos, canStack, promoStatus, type PromoContext } from "./engine";
import { Influencer, Promo } from "@/lib/domain/types";

const now = Date.UTC(2026, 8, 8);
const mk = (o: Partial<Promo> & { code: string; type: Promo["type"] }) => Promo.parse({ amount: 0, startAt: now - 1000, createdAt: 1, updatedAt: 1, ...o });
const items = [
  { slug: "les-fruits", qty: 2, unitPrice: 1000, title: "Les fruits", stock: null },
  { slug: "le-visage", qty: 1, unitPrice: 1000, title: "Le Visage", stock: 5 },
];
const influ = Influencer.parse({ id: "inf_1", name: "Marie Petit-Pas", slug: "marie", code: "MARIE10", discount: 10, rate: 15, createdAt: 1, updatedAt: 1 });
const base = (promos: Promo[], extra: Partial<PromoContext> = {}): PromoContext => ({
  now,
  subtotal: 3000,
  items,
  usedByCustomer: {},
  refInfluencer: null,
  promos: new Map(promos.map((p) => [p.code, p])),
  influencers: new Map([["inf_1", influ]]),
  ...extra,
});

describe("moteur des codes promo", () => {
  it("applique un pourcentage et un montant, dans cet ordre, sans passer sous zéro", () => {
    const ctx = base([mk({ code: "DIX", type: "percent", amount: 10, stackWith: ["MOINS5"] }), mk({ code: "MOINS5", type: "fixed", amount: 500 })]);
    const r = applyPromos(["DIX", "MOINS5"], ctx);
    expect(r.rejected).toEqual([]);
    expect(r.applied.map((a) => [a.code, a.amount])).toEqual([
      ["DIX", 250], // 10 % de (3000 − 500)
      ["MOINS5", 500],
    ]);
    expect(r.discount).toBe(750);
  });

  it("refuse un code non cumulable, expiré, sous le minimum ou déjà utilisé", () => {
    const ctx = base([
      mk({ code: "AA", type: "percent", amount: 10 }),
      mk({ code: "BB", type: "percent", amount: 5 }),
      mk({ code: "VIEUX", type: "percent", amount: 5, endAt: now - 1 }),
      mk({ code: "GROS", type: "fixed", amount: 500, minimum: 5000 }),
      mk({ code: "UNEFOIS", type: "percent", amount: 5 }),
    ], { usedByCustomer: { UNEFOIS: 1 } });
    const r = applyPromos(["AA", "BB", "VIEUX", "GROS", "UNEFOIS", "INCONNU"], ctx);
    expect(r.applied.map((a) => a.code)).toEqual(["AA"]);
    expect(r.rejected.map((x) => x.code)).toEqual(["BB", "VIEUX", "GROS", "UNEFOIS", "INCONNU"]);
    expect(r.rejected[0].reason).toMatch(/Non cumulable avec AA/);
  });

  it("livraison offerte et produit offert ne remisent pas mais agissent", () => {
    const ctx = base([mk({ code: "PORT", type: "free_shipping", stackWith: ["CADEAU"] }), mk({ code: "CADEAU", type: "gift", gifts: ["le-visage"] })]);
    const r = applyPromos(["PORT", "CADEAU"], ctx);
    expect(r.discount).toBe(0);
    expect(r.freeShipping).toBe(true);
    expect(r.giftLines).toEqual([{ slug: "le-visage", qty: 1 }]);
  });

  it("attribue la vente à l'influenceur par le code, et applique son code par le lien", () => {
    const marie = mk({ code: "MARIE10", type: "percent", amount: 10, influencerId: "inf_1" });
    const byCode = applyPromos(["MARIE10"], base([marie]));
    expect(byCode.attribution).toEqual({ influencerId: "inf_1", via: "code" });
    expect(byCode.discount).toBe(300);

    const byLink = applyPromos([], base([marie], { refInfluencer: influ }));
    expect(byLink.applied[0]).toMatchObject({ code: "MARIE10", viaLink: true, amount: 300 });
    expect(byLink.attribution).toEqual({ influencerId: "inf_1", via: "link" });

    const paused = applyPromos([], base([marie], { refInfluencer: { ...influ, active: false } }));
    expect(paused.applied).toEqual([]);
    expect(paused.attribution).toBeNull();
  });

  it("le lien n'écrase pas un code influenceur tapé, et respecte le cumul", () => {
    const marie = mk({ code: "MARIE10", type: "percent", amount: 10, influencerId: "inf_1" });
    const louis = mk({ code: "LOUIS10", type: "percent", amount: 10, influencerId: "inf_2" });
    const ctx = base([marie, louis], { refInfluencer: influ, influencers: new Map([["inf_1", influ], ["inf_2", { ...influ, id: "inf_2", code: "LOUIS10", slug: "louis" }]]) });
    const r = applyPromos(["LOUIS10"], ctx);
    expect(r.applied.map((a) => a.code)).toEqual(["LOUIS10"]);
    expect(r.attribution).toEqual({ influencerId: "inf_2", via: "code" });
    expect(canStack(mk({ code: "XX", type: "percent", stackWith: ["__influ"] }), marie)).toBe(true);
    // Le marqueur influenceur est insensible à la casse (l'admin majuscule les codes).
    expect(canStack(mk({ code: "YY", type: "percent", stackWith: ["__INFLU"] }), marie)).toBe(true);
    const both = applyPromos(["NOEL"], base([mk({ code: "NOEL", type: "percent", amount: 10, stackWith: ["__INFLU"] }), marie], { refInfluencer: influ }));
    expect(both.applied.map((a) => a.code).sort()).toEqual(["MARIE10", "NOEL"]);
    expect(both.discount).toBe(570);
  });

  it("offre les frais de livraison via la case, sur n'importe quel type", () => {
    const ctx = base([mk({ code: "DIX", type: "percent", amount: 10, freeShipping: true })]);
    const r = applyPromos(["DIX"], ctx);
    expect(r.discount).toBe(300);
    expect(r.freeShipping).toBe(true);
  });

  it("calcule le statut admin", () => {
    expect(promoStatus(mk({ code: "AA", type: "percent" }), now)).toBe("Actif");
    expect(promoStatus(mk({ code: "AA", type: "percent", startAt: now + 1 }), now)).toBe("Programmé");
    expect(promoStatus(mk({ code: "AA", type: "percent", active: false }), now)).toBe("Programmé");
    expect(promoStatus(mk({ code: "AA", type: "percent", endAt: now - 1 }), now)).toBe("Expiré");
    expect(promoStatus(mk({ code: "AA", type: "percent", limit: 2, uses: 2 }), now)).toBe("Expiré");
  });
});
