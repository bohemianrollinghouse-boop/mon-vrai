import { describe, expect, it } from "vitest";
import { collectionDiscount, collectionState, type CollectionTitle } from "./collection";

const titles: CollectionTitle[] = [
  { slug: "les-fruits", title: "Les fruits", price: 1000, tint: "green", preorder: true, ageLabel: "6-18 mois" },
  { slug: "les-legumes", title: "Les légumes", price: 1000, tint: "sand", preorder: true, ageLabel: "6-18 mois" },
  { slug: "le-visage", title: "Le visage", price: 800, tint: "pink", preorder: true, ageLabel: "6-18 mois" },
];

describe("offre collection complète", () => {
  it("n'applique rien quand l'offre est désactivée, même collection complète", () => {
    const s = collectionState(titles, new Set(["les-fruits", "les-legumes", "le-visage"]), false);
    expect(s.complete).toBe(true);
    expect(collectionDiscount(s)).toBe(0);
  });

  it("offre le titre le moins cher quand la collection est complète et l'offre activée", () => {
    const s = collectionState(titles, new Set(["les-fruits", "les-legumes", "le-visage"]), true);
    expect(s.complete).toBe(true);
    expect(s.giftAmount).toBe(800); // le moins cher
    expect(s.fullPrice).toBe(2800);
    expect(s.offerPrice).toBe(2000);
    expect(collectionDiscount(s)).toBe(800);
  });

  it("liste les titres manquants et leur coût quand la collection est incomplète", () => {
    const s = collectionState(titles, new Set(["les-fruits"]), true);
    expect(s.complete).toBe(false);
    expect(s.missing.map((m) => m.slug)).toEqual(["les-legumes", "le-visage"]);
    expect(s.missingCost).toBe(1800);
    expect(collectionDiscount(s)).toBe(0);
  });

  it("une collection vide n'est jamais complète", () => {
    const s = collectionState([], new Set(), true);
    expect(s.complete).toBe(false);
    expect(collectionDiscount(s)).toBe(0);
  });
});
