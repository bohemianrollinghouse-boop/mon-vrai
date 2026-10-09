import { describe, expect, it } from "vitest";
import {
  contentKind,
  contentMime,
  contentPath,
  fileSizeLabel,
  progressLabel,
  quotaLabel,
  safeFileName,
  shortfall,
  shortfallLabel,
  tallyContents,
} from "./deliverables";
import type { DeliverableKind } from "./types";

/*
 * Ce qui compte ici : qu'un décompte ne mente jamais, et qu'un fichier déposé se
 * retrouve. Le reste n'est que mise en forme — mais c'est cette mise en forme que le
 * contrat cite, et elle ne doit pas annoncer « 0 photo ».
 */

const item = (kind: DeliverableKind) => ({ kind });

describe("le type d'un fichier", () => {
  it("se lit sur l'entête quand il en a un", () => {
    expect(contentKind("vacances.jpg", "image/jpeg")).toBe("photo");
    expect(contentKind("reel.mp4", "video/mp4")).toBe("video");
  });

  /* Windows livre régulièrement un HEIC sans type du tout : sans ce rattrapage, la
     photo d'un iPhone serait refusée comme « ni photo ni vidéo ». */
  it("se déduit de l'extension quand l'entête est vide", () => {
    expect(contentKind("IMG_4821.HEIC", "")).toBe("photo");
    expect(contentKind("IMG_4821.MOV", "application/octet-stream")).toBe("video");
    expect(contentMime("IMG_4821.HEIC", "")).toBe("image/heic");
  });

  it("refuse ce qui n'est ni l'un ni l'autre", () => {
    expect(contentKind("contrat.pdf", "application/pdf")).toBeNull();
    expect(contentKind("notes", "")).toBeNull();
  });

  /* L'entête l'emporte : un .mov réencodé en mp4 reste ce que le fichier dit être. */
  it("croit l'entête avant l'extension", () => {
    expect(contentMime("clip.mov", "video/mp4")).toBe("video/mp4");
  });
});

describe("le chemin dans le coffre", () => {
  it("se calcule, et toujours pareil", () => {
    expect(contentPath("cmp_1", "ugc_abc", "Été à la mer.JPG")).toBe("ugc/cmp_1/ugc_abc/ete-a-la-mer.jpg");
  });

  it("garde l'extension d'un nom à rallonge", () => {
    const long = `${"a".repeat(200)}.mp4`;
    expect(safeFileName(long).endsWith(".mp4")).toBe(true);
    expect(safeFileName(long).length).toBeLessThanOrEqual(80);
  });

  it("ne rend jamais un nom vide", () => {
    expect(safeFileName("???")).toBe("fichier");
  });
});

describe("ce qui manque", () => {
  const attendu = { photos: 5, videos: 2 };

  it("se retranche de ce qui est arrivé", () => {
    const reçu = tallyContents([item("photo"), item("photo"), item("photo"), item("video")]);
    expect(reçu).toEqual({ photos: 3, videos: 1 });
    const reste = shortfall(attendu, reçu);
    expect(reste).toMatchObject({ photos: 2, videos: 1, total: 3, agreed: true, done: false });
    expect(shortfallLabel(reste)).toBe("Il manque 2 photos et 1 vidéo");
  });

  it("ne dit plus rien quand tout est là", () => {
    const reste = shortfall(attendu, { photos: 5, videos: 2 });
    expect(reste.done).toBe(true);
    expect(shortfallLabel(reste)).toBe("Tout est arrivé");
  });

  /* Un partenaire généreux ne fait pas « manquer −3 photos » : le surplus se voit dans
     le décompte, pas dans le manque. */
  it("ne compte jamais un manque négatif", () => {
    const reste = shortfall(attendu, { photos: 8, videos: 2 });
    expect(reste).toMatchObject({ photos: 0, videos: 0, done: true });
    expect(progressLabel(attendu, { photos: 8, videos: 2 })).toBe("8 photos sur 5 · 2 vidéos sur 2");
  });

  /* Zéro ne veut pas dire « rien n'est dû » mais « rien n'est compté » : l'écran
     n'affiche alors pas de décompte, et le contrat n'annonce pas de quantité. */
  it("se tait quand rien n'a été convenu", () => {
    const reste = shortfall({ photos: 0, videos: 0 }, { photos: 4, videos: 0 });
    expect(reste.agreed).toBe(false);
    expect(reste.done).toBe(false);
    expect(shortfallLabel(reste)).toBe("Aucune quantité convenue");
    expect(quotaLabel({ photos: 0, videos: 0 })).toBe("");
  });

  it("n'énumère que les postes qui comptent", () => {
    expect(quotaLabel({ photos: 5, videos: 0 })).toBe("5 photos");
    expect(quotaLabel({ photos: 1, videos: 1 })).toBe("1 photo et 1 vidéo");
    expect(shortfallLabel(shortfall({ photos: 3, videos: 2 }, { photos: 3, videos: 0 }))).toBe("Il manque 2 vidéos");
    expect(progressLabel({ photos: 3, videos: 0 }, { photos: 1, videos: 0 })).toBe("1 photo sur 3");
  });
});

describe("le poids d'un fichier", () => {
  it("se lit à la française", () => {
    expect(fileSizeLabel(850_000)).toBe("830 ko");
    expect(fileSizeLabel(4_300_000)).toBe("4,1 Mo");
    expect(fileSizeLabel(2_100_000_000)).toBe("2,0 Go");
  });
});
