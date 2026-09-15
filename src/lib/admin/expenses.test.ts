import { describe, expect, it } from "vitest";
import type { Expense } from "@/lib/domain/types";
import { NO_SALES, byCategory, byMonth, byProduct, cashTotals, daysBefore, fixedCharges, fixedMonthly, inPeriod, monthlyCost, splitCents, sumExpenses, sumSales } from "./expenses";

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
  productSlugs: [],
  documentIds: [],
  taxable: false,
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

  it("fait exister un mois qui n'a vu que des ventes", () => {
    const rows = byMonth([make({ id: "a", date: "2026-08-02", amount: 1_000 })], new Map([["2026-09", { orders: 4, revenue: 100_000, urssaf: 12_300, stripeFee: 0 }]]));
    expect(rows.map((r) => r.month)).toEqual(["2026-09", "2026-08"]);
    expect(rows[0]).toMatchObject({ in: 100_000, out: 12_300, net: 87_700 });
  });

  it("additionne ventes et frais du même mois", () => {
    const rows = byMonth([make({ id: "a", date: "2026-09-10", amount: 20_000 })], new Map([["2026-09", { orders: 4, revenue: 100_000, urssaf: 12_300, stripeFee: 0 }]]));
    expect(rows[0]).toMatchObject({ in: 100_000, out: 32_300, net: 67_700 });
  });
});

describe("sumSales", () => {
  it("additionne des mois de ventes", () => {
    expect(sumSales([
      { orders: 3, revenue: 60_000, urssaf: 7_380, stripeFee: 975 },
      { orders: 2, revenue: 40_000, urssaf: 4_920, stripeFee: 650 },
    ])).toEqual({ orders: 5, revenue: 100_000, urssaf: 12_300, stripeFee: 1_625 });
  });

  it("sans vente, tout est à zéro", () => {
    expect(sumSales([])).toEqual(NO_SALES);
  });
});

describe("cashTotals", () => {
  it("met les ventes en entrée et les cotisations en sortie, avec les lignes saisies", () => {
    const t = cashTotals(
      [make({ id: "a", amount: 30_000 }), make({ id: "b", direction: "in", category: "funding", amount: 50_000 }), make({ id: "c", amount: 9_000, status: "pending" })],
      { orders: 8, revenue: 200_000, urssaf: 24_600, stripeFee: 0 },
    );
    expect(t.in).toBe(250_000); // 200 000 de ventes + 50 000 d'apport
    expect(t.out).toBe(54_600); // 24 600 de cotisations + 30 000 de frais payés
    expect(t.net).toBe(195_400);
    // L'engagé reste dehors : il n'a pas quitté le compte.
    expect(t.pending).toBe(9_000);
  });

  it("sans vente, revient aux seules lignes saisies", () => {
    const t = cashTotals([make({ amount: 30_000 })]);
    expect(t).toMatchObject({ in: 0, out: 30_000, net: -30_000 });
    expect(t.sales).toEqual(NO_SALES);
  });

  it("cotise une entrée saisie marquée comme du chiffre d'affaires", () => {
    // 2 228 € + 1 201 € de ventes hors site, 362,48 € encaissés sur le site.
    const t = cashTotals(
      [
        make({ id: "a", direction: "in", category: "offline_sales", amount: 222_800, taxable: true }),
        make({ id: "b", direction: "in", category: "offline_sales", amount: 120_100, taxable: true }),
      ],
      { orders: 1, revenue: 36_248, urssaf: 4_459, stripeFee: 0 },
      1_230,
    );
    expect(t.in).toBe(379_148);
    // 4 459 sur la vente du site + 12,3 % de 342 900 saisis.
    expect(t.urssaf).toBe(4_459 + 42_177);
    expect(t.in - t.urssaf).toBe(332_512);
  });

  it("laisse passer un don sans rien prélever", () => {
    const t = cashTotals([make({ direction: "in", category: "funding", amount: 50_000, taxable: false })], NO_SALES, 1_230);
    expect(t.urssaf).toBe(0);
    expect(t.enteredTurnover).toBe(0);
    expect(t.net).toBe(50_000);
  });

  it("ne cotise pas une entrée seulement attendue, même marquée", () => {
    const t = cashTotals([make({ direction: "in", category: "offline_sales", amount: 50_000, taxable: true, status: "pending" })], NO_SALES, 1_230);
    expect(t.urssaf).toBe(0);
  });

  it("sort la commission Stripe avec les cotisations", () => {
    const t = cashTotals([], { orders: 2, revenue: 100_000, urssaf: 12_300, stripeFee: 1_550 }, 1_230);
    expect(t.stripeFee).toBe(1_550);
    expect(t.out).toBe(13_850);
    expect(t.net).toBe(86_150);
  });

  it("garde les lignes saisies lisibles à part des ventes", () => {
    const t = cashTotals([make({ direction: "in", category: "funding", amount: 50_000 })], { orders: 1, revenue: 10_000, urssaf: 1_230, stripeFee: 0 });
    expect(t.entered.in).toBe(50_000);
    expect(t.sales.revenue).toBe(10_000);
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

describe("splitCents", () => {
  it("répartit sans perdre ni inventer un centime", () => {
    expect(splitCents(1_000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1_000, 3).reduce((a, b) => a + b, 0)).toBe(1_000);
    expect(splitCents(900, 3)).toEqual([300, 300, 300]);
    expect(splitCents(500, 1)).toEqual([500]);
    expect(splitCents(500, 0)).toEqual([]);
  });
});

describe("byProduct", () => {
  it("additionne ce qu'un titre a coûté", () => {
    const rows = byProduct([
      make({ id: "a", productSlugs: ["les-fruits"], category: "certification", amount: 60_000 }),
      make({ id: "b", productSlugs: ["les-fruits"], category: "printing", amount: 240_000 }),
      make({ id: "c", productSlugs: ["les-animaux"], category: "lab", amount: 30_000 }),
    ]);
    expect(rows[0]).toMatchObject({ slug: "les-fruits", amount: 300_000, count: 2, shared: 0 });
    expect(rows[1]).toMatchObject({ slug: "les-animaux", amount: 30_000 });
  });

  it("répartit un frais qui couvre plusieurs titres, sans gonfler le total", () => {
    const rows = byProduct([make({ id: "a", productSlugs: ["les-fruits", "les-animaux", "le-visage"], category: "certification", amount: 60_001 })]);
    expect(rows.map((r) => r.amount).reduce((a, b) => a + b, 0)).toBe(60_001);
    expect(rows.every((r) => r.shared === 1)).toBe(true);
  });

  it("ignore les frais de structure et les entrées", () => {
    expect(byProduct([make({ id: "a", amount: 5_000 }), make({ id: "b", direction: "in", productSlugs: ["les-fruits"], amount: 5_000 })])).toEqual([]);
  });
});
