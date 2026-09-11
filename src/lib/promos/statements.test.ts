import { describe, expect, it } from "vitest";
import { Influencer, InfluencerStatement, type Order } from "@/lib/domain/types";
import { isIban, maskIban, monthLabel, statementRows } from "./statements";

const NOW = Date.UTC(2026, 8, 11, 12); // 11 septembre 2026
const inf = (over: Partial<Influencer> = {}) =>
  Influencer.parse({ id: "inf_1", name: "Marie", slug: "marie", code: "MARIE10", discount: 10, rate: 10, commission: true, createdAt: 1, updatedAt: 1, ...over });

const order = (iso: string, subtotal: number) =>
  ({
    number: `#${iso}`,
    createdAt: Date.parse(iso),
    status: "paid",
    livemode: true,
    attribution: { influencerId: "inf_1", via: "code" },
    totals: { subtotal, discount: 0, shipping: 500, total: subtotal + 500 },
  }) as unknown as Order;

const paid = (month: string, over: Partial<InfluencerStatement> = {}) =>
  InfluencerStatement.parse({ id: `inf_1_${month}`, influencerId: "inf_1", month, orders: 31, revenue: 75640, commission: 7564, status: "paid", paidAt: Date.parse("2026-09-05"), updatedAt: 1, ...over });

describe("statementRows", () => {
  it("ne rend rien quand le partenaire n'est pas commissionné", () => {
    expect(statementRows(inf({ commission: false }), [order("2026-09-02", 5000)], [], NOW)).toEqual([]);
  });

  it("groupe par mois, du plus récent au plus ancien", () => {
    const rows = statementRows(inf(), [order("2026-09-02", 5000), order("2026-08-10", 3000), order("2026-08-20", 2000)], [], NOW);
    expect(rows.map((r) => r.month)).toEqual(["2026-09", "2026-08"]);
    expect(rows[1].orders).toBe(2);
    expect(rows[1].revenue).toBe(5000);
  });

  it("marque le mois courant « en cours » et les précédents « à payer »", () => {
    const rows = statementRows(inf(), [order("2026-09-02", 5000), order("2026-08-10", 3000)], [], NOW);
    expect(rows[0].status).toBe("current");
    expect(rows[1].status).toBe("pending");
  });

  it("calcule la commission au taux du partenaire", () => {
    expect(statementRows(inf({ rate: 15 }), [order("2026-09-02", 10000)], [], NOW)[0].commission).toBe(1500);
  });

  it("un relevé payé fait foi : ses montants ne sont pas recalculés", () => {
    // La commande a été remboursée depuis : le relevé versé ne doit pas changer.
    const rows = statementRows(inf(), [order("2026-08-10", 100)], [paid("2026-08")], NOW);
    const august = rows.find((r) => r.month === "2026-08")!;
    expect(august.status).toBe("paid");
    expect(august.commission).toBe(7564);
    expect(august.orders).toBe(31);
  });

  it("garde un mois payé même sans commande restante", () => {
    const rows = statementRows(inf(), [], [paid("2026-07")], NOW);
    expect(rows.map((r) => r.month)).toEqual(["2026-07"]);
    expect(rows[0].status).toBe("paid");
  });

  it("ignore les commandes de test et les non encaissées", () => {
    const test = { ...order("2026-09-02", 5000), livemode: false } as Order;
    expect(statementRows(inf(), [test], [], NOW)).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("écrit le mois en toutes lettres", () => {
    expect(monthLabel("2026-09")).toBe("septembre 2026");
  });
});

describe("maskIban", () => {
  it("ne montre que le pays et les quatre derniers chiffres", () => {
    expect(maskIban("FR7630006000011234567890189")).toBe("FR76 •••• 0189");
  });

  it("ignore les espaces de saisie", () => {
    expect(maskIban("FR76 3000 6000 0112 3456 7890 189")).toBe("FR76 •••• 0189");
  });

  it("laisse tel quel ce qui est trop court pour être masqué", () => {
    expect(maskIban("FR76")).toBe("FR76");
  });
});

describe("isIban", () => {
  it("accepte un IBAN français", () => {
    expect(isIban("FR76 3000 6000 0112 3456 7890 189")).toBe(true);
  });

  it("refuse ce qui n'en est pas un", () => {
    for (const bad of ["", "FR76", "0076300060000112", "FRAA3000600001123456789"]) expect(isIban(bad)).toBe(false);
  });
});

describe("remboursements", () => {
  const refunded = (iso: string, subtotal: number, status: "refunded" | "cancelled" = "refunded") =>
    ({ ...order(iso, subtotal), status }) as unknown as Order;

  it("une vente remboursée reste visible, annulée par une reprise", () => {
    // Rien ne disparaît : la vente est comptée, la reprise l'annule et la nomme.
    const rows = statementRows(inf(), [order("2026-09-02", 5000), refunded("2026-09-03", 3000)], [], NOW);
    expect(rows[0].orders).toBe(2);
    expect(rows[0].earned).toBe(800);
    expect(rows[0].clawbacks).toHaveLength(1);
    expect(rows[0].clawbacks[0]).toMatchObject({ orderNumber: "#2026-09-03", amount: -300 });
    expect(rows[0].commission).toBe(500);
  });

  it("la reprise d'un mois non versé pèse sur ce mois-là, pas sur le mois en cours", () => {
    const rows = statementRows(inf(), [refunded("2026-08-10", 3000)], [], NOW);
    const august = rows.find((r) => r.month === "2026-08")!;
    expect(august.clawbacks).toHaveLength(1);
    expect(august.commission).toBe(0);
    expect(rows.find((r) => r.month === "2026-09")).toBeUndefined();
  });

  it("reprend la commission d'un mois déjà versé, sur le mois en cours", () => {
    const august = paid("2026-08", { rate: 10, orders: 1, revenue: 3000, commission: 300 });
    const rows = statementRows(inf(), [order("2026-09-02", 5000), refunded("2026-08-10", 3000)], [august], NOW);
    const sept = rows.find((r) => r.month === "2026-09")!;
    expect(sept.earned).toBe(500);
    expect(sept.clawbacks).toHaveLength(1);
    expect(sept.clawbacks[0]).toMatchObject({ orderNumber: "#2026-08-10", month: "2026-08", amount: -300 });
    expect(sept.commission).toBe(200);
  });

  it("ne réécrit pas le relevé déjà versé", () => {
    const august = paid("2026-08", { rate: 10, orders: 1, revenue: 3000, commission: 300 });
    const rows = statementRows(inf(), [refunded("2026-08-10", 3000)], [august], NOW);
    expect(rows.find((r) => r.month === "2026-08")!.commission).toBe(300);
  });

  it("reprend au taux versé, pas au taux du jour", () => {
    const august = paid("2026-08", { rate: 20, orders: 1, revenue: 3000, commission: 600 });
    const rows = statementRows(inf({ rate: 5 }), [refunded("2026-08-10", 3000)], [august], NOW);
    expect(rows.find((r) => r.month === "2026-09")!.clawbacks[0].amount).toBe(-600);
  });

  it("ne reprend pas deux fois : une reprise déjà absorbée est oubliée", () => {
    const august = paid("2026-08", { rate: 10, orders: 1, revenue: 3000, commission: 300 });
    const september = paid("2026-09", { rate: 10, orders: 0, revenue: 0, commission: -300, clawedBack: ["#2026-08-10"] });
    const rows = statementRows(inf(), [refunded("2026-08-10", 3000)], [august, september], NOW);
    expect(rows.every((r) => r.clawbacks.length === 0)).toBe(true);
  });

  it("inscrit la reprise sur le mois en cours même sans vente, quand le mois d'origine est versé", () => {
    const august = paid("2026-08", { rate: 10, orders: 1, revenue: 3000, commission: 300 });
    const rows = statementRows(inf(), [refunded("2026-08-10", 3000)], [august], NOW);
    const sept = rows.find((r) => r.month === "2026-09")!;
    expect(sept.orders).toBe(0);
    expect(sept.commission).toBe(-300);
  });

  it("traite une commande annulée comme un remboursement", () => {
    const august = paid("2026-08", { rate: 10, orders: 1, revenue: 3000, commission: 300 });
    const rows = statementRows(inf(), [refunded("2026-08-10", 3000, "cancelled")], [august], NOW);
    expect(rows.find((r) => r.month === "2026-09")!.clawbacks).toHaveLength(1);
  });

  it("un mois non versé se régularise sur place, au taux courant", () => {
    const rows = statementRows(inf({ rate: 20 }), [refunded("2026-07-10", 3000)], [], NOW);
    const july = rows.find((r) => r.month === "2026-07")!;
    expect(july.clawbacks[0].amount).toBe(-600);
    expect(july.commission).toBe(0);
  });
});
