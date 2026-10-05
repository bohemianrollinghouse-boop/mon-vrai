import { describe, expect, it } from "vitest";
import { collectionDiscount, collectionState, dayBefore, formatOfferDay, offerDay, offerEndNotice, offerEndsAt, offerLastDay, offerOver, offerRunning, type CollectionTitle } from "./collection";

const titles: CollectionTitle[] = [
  { slug: "les-fruits", title: "Les fruits", price: 1000, tint: "green", preorder: true, ageLabel: "6-18 mois" },
  { slug: "les-legumes", title: "Les légumes", price: 1000, tint: "sand", preorder: true, ageLabel: "6-18 mois" },
  { slug: "le-visage", title: "Le visage", price: 800, tint: "pink", preorder: true, ageLabel: "6-18 mois" },
];

describe("offre collection complète", () => {
  it("n'applique rien quand l'offre ne court pas, même collection complète", () => {
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

describe("durée de l'offre collection", () => {
  const offer = { enabled: true, endsOn: "2026-10-05" };

  it("court jusqu'à la veille du jour d'arrêt, et s'éteint ce jour-là", () => {
    expect(offerRunning(offer, "2026-10-03")).toBe(true);
    expect(offerRunning(offer, "2026-10-04")).toBe(true); // dernier jour servi
    expect(offerRunning(offer, "2026-10-05")).toBe(false); // elle s'arrête
    expect(offerRunning(offer, "2026-10-06")).toBe(false);
  });

  it("l'interrupteur coupe avant la date, et une offre sans date ne finit pas", () => {
    expect(offerRunning({ ...offer, enabled: false }, "2026-10-01")).toBe(false);
    expect(offerRunning({ enabled: true }, "2099-01-01")).toBe(true);
    expect(offerOver({ enabled: true }, "2099-01-01")).toBe(false);
    expect(offerOver(offer, "2026-10-05")).toBe(true);
  });

  it("compte les jours à l'heure de Paris, et non en UTC", () => {
    // 4 octobre 23 h 30 à Paris = 21 h 30 UTC : c'est encore le 4 pour le client.
    expect(offerDay(Date.UTC(2026, 9, 4, 21, 30))).toBe("2026-10-04");
    // 5 octobre 00 h 30 à Paris = 4 octobre 22 h 30 UTC : l'offre est déjà finie.
    expect(offerDay(Date.UTC(2026, 9, 4, 22, 30))).toBe("2026-10-05");
    expect(offerRunning(offer, offerDay(Date.UTC(2026, 9, 4, 22, 30)))).toBe(false);
  });

  it("dit la date en toutes lettres, sans glisser d'un jour", () => {
    expect(formatOfferDay("2026-10-05")).toBe("5 octobre 2026");
    expect(dayBefore("2026-10-05")).toBe("2026-10-04");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(offerEndNotice("2026-10-05")).toBe("L'offre s'arrête le 5 octobre 2026.");
  });
});

describe("le dernier jour de l'offre", () => {
  const offer = { enabled: true, endsOn: "2026-10-05" };

  it("n'est le dernier jour que la veille du jour d'arrêt", () => {
    expect(offerLastDay(offer, "2026-10-03")).toBe(false); // l'offre court encore un jour de plus
    expect(offerLastDay(offer, "2026-10-04")).toBe(true);
    expect(offerLastDay(offer, "2026-10-05")).toBe(false); // elle est finie
  });

  it("n'existe ni sans date d'arrêt, ni interrupteur coupé", () => {
    expect(offerLastDay({ enabled: true }, "2099-01-01")).toBe(false);
    expect(offerLastDay({ ...offer, enabled: false }, "2026-10-04")).toBe(false);
  });

  it("s'arrête à minuit heure de Paris, et non à minuit UTC", () => {
    // Heure d'été : Paris est à UTC+2, minuit chez le client est 22 h UTC la veille.
    expect(offerEndsAt("2026-10-05")).toBe(Date.UTC(2026, 9, 4, 22, 0, 0));
    // Heure d'hiver : UTC+1, donc 23 h UTC la veille.
    expect(offerEndsAt("2026-12-25")).toBe(Date.UTC(2026, 11, 24, 23, 0, 0));
  });

  it("le terme tombe bien au premier instant du jour d'arrêt, de part et d'autre", () => {
    const endsAt = offerEndsAt("2026-10-05");
    expect(offerDay(endsAt - 1000)).toBe("2026-10-04"); // une seconde avant : encore servi
    expect(offerDay(endsAt)).toBe("2026-10-05"); // l'offre vient de s'éteindre
  });
});
