import { describe, expect, it } from "vitest";
import { Product, WelcomeKit, type ImageRef } from "@/lib/domain/types";
import { kitItems, kitOffered, kitOrderLines, kitWeightG } from "./kit";

const product = (slug: string, over: Partial<Product> = {}) =>
  Product.parse({ slug, title: slug.toUpperCase(), price: 1500, weightG: 120, createdAt: 1, updatedAt: 1, ...over });

const kit = (over: Partial<WelcomeKit> = {}) => WelcomeKit.parse({ enabled: true, title: "Kit", text: "", lines: [], ...over });

const IMG: ImageRef = { url: "https://example.test/a.jpg", alt: "A" };

describe("kitItems", () => {
  it("suit l'ordre choisi et reprend titre, visuel et poids du produit", () => {
    const items = kitItems(kit({ lines: [{ slug: "b", qty: 2 }, { slug: "a", qty: 1 }] }), [product("a", { images: [IMG] }), product("b", { weightG: 90 })]);
    expect(items.map((i) => i.slug)).toEqual(["b", "a"]);
    expect(items[0]).toMatchObject({ title: "B", qty: 2, weightG: 90 });
    expect(items[1].image).toEqual(IMG);
  });

  it("ignore un livre retiré du catalogue plutôt que d'échouer", () => {
    const items = kitItems(kit({ lines: [{ slug: "a", qty: 1 }, { slug: "disparu", qty: 1 }] }), [product("a")]);
    expect(items.map((i) => i.slug)).toEqual(["a"]);
  });
});

describe("kitOffered", () => {
  it("exige le kit activé ET au moins un livre encore là", () => {
    const items = kitItems(kit({ lines: [{ slug: "a", qty: 1 }] }), [product("a")]);
    expect(kitOffered(kit({ enabled: true }), items)).toBe(true);
    expect(kitOffered(kit({ enabled: false }), items)).toBe(false);
    expect(kitOffered(kit({ enabled: true }), [])).toBe(false);
  });
});

describe("kitOrderLines", () => {
  it("produit des lignes offertes : prix nul et drapeau cadeau", () => {
    const lines = kitOrderLines(kitItems(kit({ lines: [{ slug: "a", qty: 3 }] }), [product("a", { price: 2400 })]));
    expect(lines).toEqual([{ productSlug: "a", title: "A", qty: 3, unitPrice: 0, image: undefined, preorder: false, gift: true, weightG: 120 }]);
  });
});

describe("kitWeightG", () => {
  it("compte chaque exemplaire", () => {
    const items = kitItems(kit({ lines: [{ slug: "a", qty: 2 }, { slug: "b", qty: 1 }] }), [product("a", { weightG: 100 }), product("b", { weightG: 150 })]);
    expect(kitWeightG(items)).toBe(350);
  });
});
