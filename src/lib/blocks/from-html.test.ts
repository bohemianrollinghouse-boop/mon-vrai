import { describe, expect, it } from "vitest";
import { htmlToBlocks, htmlToDocument } from "./from-html";

describe("htmlToBlocks", () => {
  it("découpe aux titres et garde le texte entre eux", () => {
    const blocks = htmlToBlocks("<p>Avant</p><h2>Transporteurs</h2><p>Après</p>");
    expect(blocks.map((b) => b.type)).toEqual(["Texte", "Titre", "Texte"]);
    expect(blocks[1].props.texte).toBe("Transporteurs");
    expect(blocks[2].props.contenu).toBe("<p>Après</p>");
  });

  it("distingue le niveau des titres", () => {
    const blocks = htmlToBlocks("<h2>Frais</h2><h3>France</h3><p>4,99 €</p>");
    expect(blocks.map((b) => b.props.niveau)).toEqual(["2", "3", undefined]);
  });

  it("retire le titre de tête quand il répète celui de la page", () => {
    const blocks = htmlToBlocks("<h1>Mentions légales</h1><p>Corps</p>", "Mentions légales");
    expect(blocks.map((b) => b.type)).toEqual(["Texte"]);
  });

  it("garde un titre de tête différent de celui de la page", () => {
    const blocks = htmlToBlocks("<h1>Préambule</h1><p>Corps</p>", "Mentions légales");
    expect(blocks.map((b) => b.type)).toEqual(["Titre", "Texte"]);
  });

  it("ignore les fragments vides", () => {
    const blocks = htmlToBlocks("<h2>Titre</h2>\n  <p> </p>\n<hr>");
    expect(blocks.map((b) => b.type)).toEqual(["Titre"]);
  });

  it("conserve le balisage interne du texte", () => {
    const blocks = htmlToBlocks("<ul><li>Un <strong>gras</strong></li></ul>");
    expect(blocks[0].props.contenu).toBe("<ul><li>Un <strong>gras</strong></li></ul>");
  });

  it("garde une image seule, même sans texte", () => {
    const blocks = htmlToBlocks('<p><img src="/a.png" alt=""></p>');
    expect(blocks).toHaveLength(1);
  });

  it("rend un document vide pour du HTML vide", () => {
    expect(htmlToBlocks("")).toEqual([]);
  });
});

describe("htmlToDocument", () => {
  it("donne à chaque bloc un identifiant stable", () => {
    const a = htmlToDocument("<h2>Un</h2><p>Texte</p>");
    const b = htmlToDocument("<h2>Un</h2><p>Texte</p>");
    expect(a.content.map((c) => c.props.id)).toEqual(["Titre-1", "Texte-2"]);
    expect(a).toEqual(b);
  });

  it("rend un document valide même sans contenu", () => {
    expect(htmlToDocument("")).toEqual({ root: { props: {} }, content: [] });
  });
});
