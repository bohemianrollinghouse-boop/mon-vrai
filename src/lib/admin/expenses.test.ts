import { describe, expect, it } from "vitest";
import type { Expense } from "@/lib/domain/types";
import { byCategory, byMonth, byProduct, daysBefore, fixedCharges, fixedMonthly, inPeriod, monthlyCost, sumExpenses } from "./expenses";

const make = (over: Partial<Expense>): Expense => ({
  id: over.id ?? "exp_1",
  direction: "out",
  category: "other",
  label: "Frais",
  supplier: "",
  amount: 1000,
  date: "2026-09-01",
  method: "card",
  status: "paid",
  recurrence: "once",
  productSlug: "",
  units: 0,
  documentId: "",
  note: "",
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe("sumExpenses", () => {
  it("sépare sorties payées, entrées et sorties engagées", () => {
    const t = sumExpenses([
      make({ id: "a", amount: 12_000 }),
      make({ id: "b", amount: 5_000, status: "pending" }),
      make({ id: "c", amount: 20_000, direction: "in", category: "funding" }),
    ]);
    expect(t).toMatchObject({ count: 3, out: 12_000, pending: 5_000, in: 20_000, net: 8_000 });
  });

  it("n'encaisse pas une entrée seulement attendue", () => {
    expect(sumExpenses([make({ direction: "in", status: "pending", amount: 9_900 })]).in).toBe(0);
  });
});

describe("inPeriod", () => {
  const list = [make({ id: "a", date: "2026-01-15" }), make({ id: "b", date: "2026-06-30" }), make({ id: "c", date: "2026-09-15" })];

  it("garde les bornes", () => {
    expect(inPeriod(list, "2026-06-30", "2026-09-15").map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("sans début, remonte à la première ligne", () => {
    expect(inPeriod(list, "", "2026-09-15")).toHaveLength(3);
  });
});

describe("daysBefore", () => {
  it("recule de n jours, changement de mois compris", () => {
    expect(daysBefore("2026-09-15", 30)).toBe("2026-08-16");
    expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
  });
});

describe("byCategory", () => {
  it("classe les postes du plus lourd au plus léger, dans un seul sens", () => {
    const rows = byCategory([
      make({ id: "a", category: "printing", amount: 30_000 }),
      make({ id: "b", category: "lab", amount: 45_000 }),
      make({ id: "c", category: "printing", amount: 5_000 }),
      make({ id: "d", category: "funding", amount: 99_000, direction: "in" }),
    ]);
    expect(rows).toEqual([
      { category: "lab", amount: 45_000, count: 1 },
      { category: "printing", amount: 35_000, count: 2 },
    ]);
  });
});

describe("byMonth", () => {
  it("regroupe par mois, du plus récent au plus ancien", () => {
    const rows = byMonth([make({ id: "a", date: "2026-08-02", amount: 1_000 }), make({ id: "b", date: "2026-09-04", amount: 2_000 }), make({ id: "c", date: "2026-09-28", amount: 3_000 })]);
    expect(rows.map((r) => [r.month, r.out])).toEqual([
      ["2026-09", 5_000],
      ["2026-08", 1_000],
    ]);
  });
});

describe("monthlyCost", () => {
  it("ramène chaque rythme au mois", () => {
    expect(monthlyCost(1_200, "monthly")).toBe(1_200);
    expect(monthlyCost(1_200, "quarterly")).toBe(400);
    expect(monthlyCost(12_000, "yearly")).toBe(1_000);
    expect(monthlyCost(50_000, "once")).toBe(0);
  });
});

describe("fixedCharges", () => {
  it("ne compte qu'une fois un abonnement payé plusieurs années de suite", () => {
    const list = [
      make({ id: "a", label: "Assurance RC pro", supplier: "AXA", category: "insurance", recurrence: "yearly", amount: 24_000, date: "2025-04-01" }),
      make({ id: "b", label: "Assurance RC pro", supplier: "AXA", category: "insurance", recurrence: "yearly", amount: 27_600, date: "2026-04-01" }),
    ];
    const charges = fixedCharges(list);
    expect(charges).toHaveLength(1);
    // La dernière occurrence fait foi : c'est le tarif en cours.
    expect(charges[0]).toMatchObject({ amount: 27_600, monthly: 2_300 });
    expect(fixedMonthly(list)).toBe(2_300);
  });

  it("ignore le ponctuel et les entrées", () => {
    expect(fixedCharges([make({ id: "a", amount: 90_000 }), make({ id: "b", direction: "in", recurrence: "monthly", amount: 5_000 })])).toEqual([]);
  });
});

describe("byProduct", () => {
  it("additionne ce qu'un titre a coûté et l'amortit sur les exemplaires couverts", () => {
    const rows = byProduct([
      make({ id: "a", productSlug: "les-fruits", category: "certification", amount: 60_000 }),
      make({ id: "b", productSlug: "les-fruits", category: "printing", amount: 240_000, units: 1_000 }),
      make({ id: "c", productSlug: "les-animaux", category: "lab", amount: 30_000 }),
    ]);
    expect(rows[0]).toMatchObject({ slug: "les-fruits", amount: 300_000, count: 2, units: 1_000, perUnit: 240 });
    // Sans exemplaire couvert, pas de coût unitaire inventé.
    expect(rows[1]).toMatchObject({ slug: "les-animaux", perUnit: null });
  });
});
