import { describe, expect, it } from "vitest";
import { breakEven } from "./breakeven";
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
