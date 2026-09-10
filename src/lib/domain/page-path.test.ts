import { describe, expect, it } from "vitest";
import { PagePath } from "./types";
import { PINNED_SLUGS, isReservedPath, pagePath } from "./system-pages";

describe("PagePath", () => {
  it("accepte une adresse d'un seul segment", () => {
    expect(PagePath.safeParse("notre-histoire").success).toBe(true);
  });

  it("accepte une adresse imbriquée", () => {
    expect(PagePath.safeParse("infos/conditions-de-vente").success).toBe(true);
  });

  it("refuse un slash initial ou final", () => {
    expect(PagePath.safeParse("/notre-histoire").success).toBe(false);
    expect(PagePath.safeParse("notre-histoire/").success).toBe(false);
  });

  it("refuse les majuscules, les espaces et les accents", () => {
    for (const bad of ["Notre-Histoire", "notre histoire", "notre-hist​oire ", "épopée"]) {
      expect(PagePath.safeParse(bad).success).toBe(false);
    }
  });

  it("refuse les segments vides", () => {
    expect(PagePath.safeParse("a//b").success).toBe(false);
  });
});

describe("isReservedPath", () => {
  it("refuse les routes du site, quel que soit le reste du chemin", () => {
    for (const p of ["panier", "admin", "api", "livres/le-visage", "admin/pages"]) {
      expect(isReservedPath(p)).toBe(true);
    }
  });

  it("laisse passer une adresse ordinaire", () => {
    for (const p of ["notre-histoire", "privacy-policy", "infos/conditions-de-vente", "paniers"]) {
      expect(isReservedPath(p)).toBe(false);
    }
  });
});

describe("pagePath", () => {
  it("sert la page à la racine, sans préfixe", () => {
    expect(pagePath("notre-histoire")).toBe("/notre-histoire");
    expect(pagePath("infos/cgv")).toBe("/infos/cgv");
  });
});

describe("adresses libérées et épinglées", () => {
  it("« catalogue » et « contact » ne sont plus réservées : ce sont des pages", () => {
    expect(isReservedPath("catalogue")).toBe(false);
    expect(isReservedPath("contact")).toBe(false);
  });

  it("mais elles sont épinglées : le site y renvoie en dur", () => {
    expect(PINNED_SLUGS.has("catalogue")).toBe(true);
    expect(PINNED_SLUGS.has("contact")).toBe(true);
    expect(PINNED_SLUGS.has("notre-histoire")).toBe(false);
  });

  it("les routes qui restent statiques demeurent réservées", () => {
    for (const p of ["panier", "compte", "commande", "recherche", "livres/le-visage"]) {
      expect(isReservedPath(p)).toBe(true);
    }
  });
});
