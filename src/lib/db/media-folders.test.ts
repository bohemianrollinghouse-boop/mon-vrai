import { describe, expect, it } from "vitest";
import { mediaFolders } from "./media-folders";
import type { Media } from "@/lib/domain/types";

/*
 * Les dossiers de la médiathèque se DÉDUISENT des fichiers : il n'y a pas de liste de
 * dossiers à tenir, donc aucun dossier vide qui traîne, et aucun à créer avant d'y
 * ranger quoi que ce soit. Le fonds commun n'en est pas un — c'est l'absence de dossier.
 */

const file = (folder: string, id = Math.random().toString(36)): Media => ({ id, folder }) as Media;

describe("dossiers de la médiathèque", () => {
  it("les déduit des fichiers, avec leur compte", () => {
    expect(mediaFolders([file("Camille"), file("Zoé"), file("Camille")])).toEqual([
      { name: "Camille", count: 2 },
      { name: "Zoé", count: 1 },
    ]);
  });

  it("ne compte pas le fonds commun parmi les dossiers", () => {
    expect(mediaFolders([file(""), file(""), file("Camille")])).toEqual([{ name: "Camille", count: 1 }]);
    expect(mediaFolders([file(""), file("")])).toEqual([]);
  });

  it("range par nom, à la française", () => {
    expect(mediaFolders([file("Zoé"), file("Élise"), file("Camille")]).map((f) => f.name)).toEqual(["Camille", "Élise", "Zoé"]);
  });
});
