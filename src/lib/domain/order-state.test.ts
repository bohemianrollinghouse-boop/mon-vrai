import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  formatInvoiceNumber,
  formatOrderNumber,
  stockIsReserved,
} from "./order-state";

describe("transitions de commande", () => {
  it("suit le chemin nominal", () => {
    expect(canTransition("pending_payment", "paid")).toBe(true);
    expect(canTransition("paid", "preparing")).toBe(true);
    expect(canTransition("preparing", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("interdit de sauter ou de revenir en arrière", () => {
    expect(canTransition("pending_payment", "shipped")).toBe(false);
    expect(canTransition("shipped", "paid")).toBe(false);
    expect(() => assertTransition("delivered", "preparing")).toThrow(/interdite/);
  });

  it("rend les états terminaux définitifs", () => {
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(canTransition("refunded", "shipped")).toBe(false);
  });

  it("permet le remboursement après paiement, pas avant", () => {
    expect(canTransition("paid", "refunded")).toBe(true);
    expect(canTransition("pending_payment", "refunded")).toBe(false);
  });
});

describe("stockIsReserved", () => {
  it("ne compte le stock qu'une fois la commande payée", () => {
    expect(stockIsReserved("pending_payment")).toBe(false);
    expect(stockIsReserved("paid")).toBe(true);
    expect(stockIsReserved("shipped")).toBe(true);
    expect(stockIsReserved("cancelled")).toBe(false);
    expect(stockIsReserved("refunded")).toBe(false);
  });
});

describe("numéros", () => {
  const march2026 = Date.UTC(2026, 2, 14);

  it("formate commande et facture sur cinq chiffres avec l'année de création", () => {
    expect(formatOrderNumber(42, march2026)).toBe("MV-2026-00042");
    expect(formatInvoiceNumber(7, march2026)).toBe("F-2026-00007");
  });

  it("prend l'année de la date fournie, pas celle du jour", () => {
    expect(formatOrderNumber(1, Date.UTC(2031, 0, 1))).toBe("MV-2031-00001");
  });
});
