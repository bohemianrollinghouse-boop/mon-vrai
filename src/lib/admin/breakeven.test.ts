import { describe, expect, it } from "vitest";
import { amortisation, breakEven } from "./breakeven";
import { Costs } from "@/lib/domain/types";

const costs = (patch: Partial<ReturnType<typeof Costs.parse>> = {}) =>
  Costs.parse({ urssafBp: 1200, bookCost: 120, packagingCost: 250, stripeBp: 150, stripeFixed: 25, productionCost: 350_000, bookPrice: 1000, ...patch });

describe("Seuil de rentabilité", () => {
  it("retire cotisations, commission et fabrication du prix de vente", () => {
    const b = breakEven(costs());
    expect(b.urssaf).toBe(120); // 12 % de 10,00 €
    expect(b.stripe).toBe(40); // 1,5 % de 10,00 € + 0,25 €
    expect(b.bookCost).toBe(120);
    expect(b.perBook).toBe(720); // 7,20 €
  });

  it("vise le livre qui franchit l'objectif, pas celui qui l'approche", () => {
    const b = breakEven(costs());
    // 486 × 7,20 € = 3 499,20 € : il manque 0,80 €. Le 487e passe la barre.
    expect(486 * b.perBook).toBeLessThan(b.production);
    expect(487 * b.perBook).toBeGreaterThanOrEqual(b.production);
    expect(b.target).toBe(487);
  });

  it("n'a pas d'objectif quand un livre ne rapporte rien", () => {
    expect(breakEven(costs({ bookCost: 1000 })).target).toBeNull();
    expect(breakEven(costs({ productionCost: 0 })).target).toBeNull();
  });
});

describe("Amortissement réel du tirage", () => {
  const sale = (total: number, shipping: number, lines: { qty: number; gift: boolean }[]) => ({ totals: { total, shipping }, lines });

  it("compte ce qu'une vente plein tarif laisse vraiment", () => {
    const a = amortisation([sale(1000, 0, [{ qty: 1, gift: false }])], costs());
    expect(a.books).toBe(1);
    expect(a.gifted).toBe(0);
    expect(a.amortised).toBe(720); // les 7,20 € du seuil
    expect(a.perBook).toBe(720);
  });

  it("retire le port de ce que les livres ont rapporté, pas des cotisations", () => {
    // 10 € de livres + 4,90 € de port : les cotisations portent sur les 14,90 € encaissés.
    const a = amortisation([sale(1490, 490, [{ qty: 1, gift: false }])], costs());
    // 1000 − 179 (12 % de 1490) − 47 (1,5 % de 1490 + 0,25 €) − 120 = 654
    expect(a.amortised).toBe(654);
  });

  it("fait rentrer moins quand un code promo s'applique", () => {
    const plein = amortisation([sale(1000, 0, [{ qty: 1, gift: false }])], costs());
    const remise = amortisation([sale(900, 0, [{ qty: 1, gift: false }])], costs());
    expect(remise.amortised).toBeLessThan(plein.amortised);
    expect(remise.amortised).toBe(633); // 900 − 108 (12 %) − 39 (1,5 % + 0,25 €) − 120
  });

  it("fait payer le neuvième livre offert sans rien en recevoir", () => {
    // Huit livres payés, le neuvième offert : neuf exemplaires sortent du tirage.
    const a = amortisation([sale(8000, 0, [{ qty: 8, gift: false }, { qty: 1, gift: true }])], costs());
    expect(a.books).toBe(9);
    expect(a.gifted).toBe(1);
    // 8000 − 960 − 145 − 9 × 120 = 5815, soit 646 par exemplaire au lieu de 720.
    expect(a.amortised).toBe(5815);
    expect(a.perBook).toBe(646);
  });

  it("estime ce qu'il reste au rythme observé, et sait quand c'est fini", () => {
    const petit = amortisation([sale(1000, 0, [{ qty: 1, gift: false }])], costs());
    expect(petit.reached).toBe(false);
    // (350 000 − 720) / 720 → 486 exemplaires encore.
    expect(petit.remaining).toBe(486);

    const fini = amortisation([sale(500_000, 0, [{ qty: 500, gift: false }])], costs());
    expect(fini.reached).toBe(true);
    expect(fini.remaining).toBe(0);
    expect(fini.pct).toBe(100);
  });
});
