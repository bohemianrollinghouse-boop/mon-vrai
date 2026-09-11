import { describe, expect, it } from "vitest";
import { conceptBlocks, storyBlocks } from "./editorial-pages";
import { BlockDocument, type ImageRef } from "@/lib/domain/types";

/*
 * Les deux pages rédigées. Le nom des blocs et leurs props sont déjà vérifiés à la
 * compilation (`block()` est typé sur le catalogue) ; restent les cohérences que le
 * typage ne voit pas — le sommaire qui vise vraiment un chapitre de la page, et les
 * photos manquantes qui ne doivent rien casser.
 */

const photo = (name: string): ImageRef => ({ url: `https://example.test/${name}`, alt: "" });

describe("storyBlocks", () => {
  it("produit un document de blocs valide", () => {
    expect(BlockDocument.safeParse(storyBlocks(photo)).success).toBe(true);
  });

  it("chaque ancre du sommaire vise un chapitre de la page", () => {
    const doc = storyBlocks(photo);
    const anchors = new Set(doc.content.filter((b) => b.type === "Chapitre").map((b) => `#${b.props.ancre as string}`));
    const entries = (doc.content.find((b) => b.type === "Sommaire")?.props.entrees ?? []) as { lien: string }[];

    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      // Un renvoi vers une autre page est permis ; une ancre doit exister.
      if (e.lien.startsWith("#")) expect(anchors).toContain(e.lien);
    }
  });

  it("tient le récit dans la colonne de lecture", () => {
    const doc = storyBlocks(photo);
    const recit = doc.content.filter((b) => b.type === "Chapitre" || b.type === "Sommaire");

    expect(recit.length).toBeGreaterThan(1);
    for (const b of recit) expect(b.props.disposition).toBe("centre");
  });

  it("garde la chute d'un chapitre illustré après sa photo", () => {
    const doc = storyBlocks(photo);
    const chap2 = doc.content.find((b) => b.props.ancre === "chapitre-2");

    expect(chap2?.props.image).toBeDefined();
    expect(chap2?.props.texteFin).toMatch(/^Créés d'abord pour une enfant/);
    // La chute ne doit pas rester en double dans les paragraphes qui précèdent l'image.
    const paras = chap2?.props.paragraphes as { relief: string }[];
    expect(paras.some((p) => p.relief === "chute")).toBe(false);
  });

  it("n'ajoute l'infolettre que si on lui en donne une", () => {
    const has = (doc: BlockDocument) => doc.content.some((b) => b.type === "Infolettre");
    expect(has(storyBlocks(photo))).toBe(false);
    expect(has(storyBlocks(photo, { heading: "h", text: "t", placeholder: "p", button: "b" }))).toBe(true);
  });
});

describe("conceptBlocks", () => {
  it("produit un document de blocs valide", () => {
    expect(BlockDocument.safeParse(conceptBlocks(photo)).success).toBe(true);
  });

  it("se compose même sans aucune photo", () => {
    const doc = conceptBlocks(() => undefined);
    expect(BlockDocument.safeParse(doc).success).toBe(true);
    expect(doc.content.length).toBeGreaterThan(10);
  });
});
