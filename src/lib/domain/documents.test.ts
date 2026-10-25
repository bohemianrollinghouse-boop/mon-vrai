import { describe, expect, it } from "vitest";
import { documentMime } from "./documents";

/*
 * Un navigateur n'est pas tenu d'annoncer le type d'un fichier : Windows en livre
 * régulièrement avec `type` vide, et certains le rangent en octet-stream. Le dépôt
 * refusait alors un PDF parfaitement ordinaire. L'entête fait foi quand il dit quelque
 * chose d'utile, l'extension tranche quand il se tait — et jamais l'inverse.
 */

describe("type d'une pièce administrative", () => {
  it("croit l'entête quand il annonce un type accepté", () => {
    expect(documentMime("contrat.pdf", "application/pdf")).toBe("application/pdf");
    expect(documentMime("photo.jpg", "image/jpeg")).toBe("image/jpeg");
  });

  it("retombe sur l'extension quand le navigateur se tait", () => {
    expect(documentMime("Kit de création.pdf", "")).toBe("application/pdf");
    expect(documentMime("norme.PDF", "")).toBe("application/pdf");
    expect(documentMime("tableau.xlsx", "")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("corrige un octet-stream dont le nom dit mieux", () => {
    expect(documentMime("rapport.pdf", "application/octet-stream")).toBe("application/pdf");
  });

  it("ne sauve pas ce qu'aucune des deux pistes ne reconnaît", () => {
    expect(documentMime("video.mov", "video/quicktime")).toBe("video/quicktime");
    expect(documentMime("sans-extension", "")).toBe("");
  });
});
