import { describe, expect, it } from "vitest";
import { addQty, freeShippingProgress, itemCount, priceLines, setLineQty, subtotal } from "./cart-math";
import type { Product } from "./types";

function product(slug: string, price: number, status: Product["status"] = "published"): Product {
  return {
    slug,
    title: slug,
    ageLabel: "6–18 mois",
    subtitle: "",
    descriptionHtml: "",
    items: [],
    price,
    images: [],
    badge: "none",
    tint: "green",
    preorder: { enabled: false },
    stock: null,
    position: 0,
    status,
    seo: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

const catalogue = new Map<string, Product>([
  ["visage", product("visage", 1000)],
  ["ferme", product("ferme", 1000)],
  ["brouillon", product("brouillon", 1000, "draft")],
]);

describe("priceLines / subtotal", () => {
  it("chiffre chaque ligne au prix courant du produit", () => {
    const lines = priceLines([{ productSlug: "visage", qty: 2 }, { productSlug: "ferme", qty: 1 }], catalogue);
    expect(lines.map((l) => l.lineTotal)).toEqual([2000, 1000]);
    expect(subtotal(lines)).toBe(3000);
    expect(itemCount(lines)).toBe(3);
  });

  it("ignore un produit disparu ou dépublié plutôt que de planter le panier", () => {
    const lines = priceLines([{ productSlug: "fantome", qty: 1 }, { productSlug: "brouillon", qty: 1 }], catalogue);
    expect(lines).toEqual([]);
  });
});

describe("freeShippingProgress", () => {
  it("mesure ce qui reste jusqu'au seuil", () => {
    expect(freeShippingProgress(1000, 3000)).toEqual({ enabled: true, reached: false, remaining: 2000, percent: 33 });
  });

  it("plafonne à 100 % et plancher le reste à zéro une fois le seuil dépassé", () => {
    expect(freeShippingProgress(4500, 3000)).toEqual({ enabled: true, reached: true, remaining: 0, percent: 100 });
  });

  it("se désactive quand le seuil est nul", () => {
    expect(freeShippingProgress(1000, 0).enabled).toBe(false);
  });
});

describe("setLineQty / addQty", () => {
  it("remplace, ajoute ou retire une ligne", () => {
    const lines = [{ productSlug: "visage", qty: 1 }];
    expect(setLineQty(lines, "visage", 3)).toEqual([{ productSlug: "visage", qty: 3 }]);
    expect(setLineQty(lines, "ferme", 1)).toEqual([...lines, { productSlug: "ferme", qty: 1 }]);
    expect(setLineQty(lines, "visage", 0)).toEqual([]);
  });

  it("incrémente et décrémente jusqu'au retrait", () => {
    const lines = [{ productSlug: "visage", qty: 1 }];
    expect(addQty(lines, "visage", 1)).toEqual([{ productSlug: "visage", qty: 2 }]);
    expect(addQty(lines, "visage", -1)).toEqual([]);
  });

  it("borne la quantité pour éviter un panier absurde", () => {
    expect(setLineQty([], "visage", 999)).toEqual([{ productSlug: "visage", qty: 50 }]);
  });
});
