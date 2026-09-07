import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formToObject, parseForm } from "./form";

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("formToObject", () => {
  it("reconstruit des objets imbriqués et des tableaux indexés", () => {
    const out = formToObject(
      fd([
        ["hero.heading", "Bonjour"],
        ["tiles[0].title", "A"],
        ["tiles[1].title", "B"],
        ["tiles[1].tint", "green"],
      ]),
    );
    expect(out).toEqual({ hero: { heading: "Bonjour" }, tiles: [{ title: "A" }, { title: "B", tint: "green" }] });
  });

  it("empile les champs répétés `x[]` dans une liste", () => {
    expect(formToObject(fd([["subjects[]", "Livraison"], ["subjects[]", "Autre"]]))).toEqual({ subjects: ["Livraison", "Autre"] });
  });

  it("convertit les nombres déclarés, y compris avec une virgule et dans des listes", () => {
    const out = formToObject(fd([["price", "10,50"], ["tiles[0].n", "3"], ["empty", ""]]), { numbers: ["price", "tiles[].n", "empty"] });
    expect(out).toEqual({ price: 10.5, tiles: [{ n: 3 }], empty: undefined });
  });

  it("donne false aux cases à cocher absentes et true aux cochées", () => {
    const out = formToObject(fd([["announcement.enabled", "on"]]), { booleans: ["announcement.enabled", "shipping.free"] });
    expect(out).toEqual({ announcement: { enabled: true }, shipping: { free: false } });
  });

  it("ignore les champs techniques préfixés par $", () => {
    expect(formToObject(fd([["$intent", "save"], ["title", "x"]]))).toEqual({ title: "x" });
  });
});

describe("parseForm", () => {
  const Schema = z.object({ title: z.string().min(1, "Titre requis"), price: z.number().int().nonnegative() });

  it("renvoie les données typées quand le formulaire est valide", () => {
    const r = parseForm(Schema, fd([["title", "Le Visage"], ["price", "1000"]]), { numbers: ["price"] });
    expect(r).toEqual({ ok: true, data: { title: "Le Visage", price: 1000 } });
  });

  it("nomme le champ fautif et garde une erreur par champ", () => {
    const r = parseForm(Schema, fd([["title", ""], ["price", "abc"]]), { numbers: ["price"] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("(title)");
      expect(Object.keys(r.issues).sort()).toEqual(["price", "title"]);
    }
  });
});
