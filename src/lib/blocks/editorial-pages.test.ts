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
