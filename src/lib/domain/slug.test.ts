import { describe, expect, it } from "vitest";
import { extractItems, slugify, splitLegacyTitle } from "./slug";

describe("slugify", () => {
  it("retire accents, casse et ponctuation", () => {
    expect(slugify("Les Animaux de la forêt")).toBe("les-animaux-de-la-foret");
    expect(slugify("  Le Visage ")).toBe("le-visage");
    expect(slugify("L'oie & le cheval")).toBe("l-oie-le-cheval");
  });
});

describe("splitLegacyTitle", () => {
  it("sépare le surtitre du nom sur « : »", () => {
    expect(splitLegacyTitle("6-18 mois : Le Visage")).toEqual({ ageLabel: "6-18 mois", name: "Le Visage" });
  });

  it("laisse le surtitre vide sans séparateur", () => {
    expect(splitLegacyTitle("Coffret complet")).toEqual({ ageLabel: "", name: "Coffret complet" });
  });
});

describe("extractItems", () => {
  it("lit la liste entre « : » et le premier point, en séparant sur la virgule et le « et »", () => {
    const html =
      "<p>Un imagier pour découvrir les fruits : la pomme, la clémentine, la banane, la fraise, l'abricot et le kiwi. Des fruits que l'enfant…</p>";
    expect(extractItems(html)).toEqual(["la pomme", "la clémentine", "la banane", "la fraise", "l'abricot", "le kiwi"]);
  });

  it("garde « cochon d'Inde » entier : le « et » ne coupe que comme mot", () => {
    const html = "<p>Découvrir : le chien, le chat, le cochon d'Inde, le furet et le poisson rouge.</p>";
    expect(extractItems(html)).toEqual(["le chien", "le chat", "le cochon d'Inde", "le furet", "le poisson rouge"]);
  });

  it("renvoie une liste vide quand la forme n'est pas reconnue", () => {
    expect(extractItems("<p>Un livre sans liste.</p>")).toEqual([]);
    expect(extractItems("")).toEqual([]);
  });
});
