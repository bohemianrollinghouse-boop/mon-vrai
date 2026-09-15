import { describe, expect, it } from "vitest";
import { Expense } from "./types";

/*
 * Le schéma d'un mouvement a changé en cours de route : un frais ne portait qu'UN titre
 * et UN justificatif, et comptait des exemplaires. `parseDoc` lève sur un document
 * invalide et l'écran entier tomberait — d'où une lecture qui reprend l'ancienne forme
 * plutôt qu'une migration. Ces tests gardent ce filet en place.
 */

const base = {
  id: "exp_1",
  direction: "out",
  category: "certification",
  label: "Normes CE",
  supplier: "Bureau Veritas",
  amount: 60_000,
  date: "2026-01-12",
  method: "card",
  status: "paid",
  recurrence: "once",
  note: "",
  createdAt: 1,
  updatedAt: 2,
};

describe("Expense, reprise de l'ancienne forme", () => {
  it("promeut un titre unique en liste", () => {
    const e = Expense.parse({ ...base, productSlug: "les-fruits", documentId: "doc_7", units: 1_000 });
    expect(e.productSlugs).toEqual(["les-fruits"]);
    expect(e.documentIds).toEqual(["doc_7"]);
  });

  it("laisse vide ce qui n'était pas renseigné", () => {
    const e = Expense.parse({ ...base, productSlug: "", documentId: "", units: 0 });
    expect(e.productSlugs).toEqual([]);
    expect(e.documentIds).toEqual([]);
  });

  it("ne garde aucune trace des anciens champs", () => {
    const e = Expense.parse({ ...base, productSlug: "les-fruits", documentId: "doc_7", units: 1_000 });
    expect(e).not.toHaveProperty("productSlug");
    expect(e).not.toHaveProperty("documentId");
    expect(e).not.toHaveProperty("units");
  });

  it("n'écrase pas la forme nouvelle quand les deux se croisent", () => {
    const e = Expense.parse({ ...base, productSlug: "les-fruits", productSlugs: ["les-animaux", "le-visage"] });
    expect(e.productSlugs).toEqual(["les-animaux", "le-visage"]);
  });

  it("lit la forme nouvelle sans rien faire", () => {
    const e = Expense.parse({ ...base, productSlugs: ["les-fruits"], documentIds: ["doc_1", "doc_2"] });
    expect(e.productSlugs).toEqual(["les-fruits"]);
    expect(e.documentIds).toHaveLength(2);
  });

  it("refuse un slug qui n'en est pas un", () => {
    expect(() => Expense.parse({ ...base, productSlugs: ["Les Fruits"] })).toThrow();
  });
});
