import { describe, expect, it } from "vitest";
import { filterShelf, mediaShelf, shelfFolders } from "./media-shelf";
import type { Deliverable, Influencer, Media } from "@/lib/domain/types";

/*
 * Ce qui est vérifié ici tient en une phrase : les deux coffres se rejoignent dans un
 * écran SANS se confondre — un contenu reçu d'un créateur n'a pas d'adresse publique, et
 * c'est précisément ce qui le distingue d'une photo de la médiathèque.
 */

const media = (over: Partial<Media> = {}): Media =>
  ({ id: "m1", path: "media/m1/photo.jpg", url: "https://cdn.test/photo.jpg", alt: "", folder: "", mime: "image/jpeg", createdAt: 100, ...over }) as Media;

const content = (over: Partial<Deliverable> = {}): Deliverable =>
  ({ id: "d1", campaignId: "cp1", influencerId: "inf1", kind: "video", path: "ugc/cp1/d1/rush.mp4", filename: "rush.mp4", mime: "video/mp4", size: 1, mediaId: "", receivedAt: 200, ...over }) as Deliverable;

const influencer = (id = "inf1", name = "Camille"): Influencer => ({ id, name }) as Influencer;

const shelf = (over: Partial<Parameters<typeof mediaShelf>[0]> = {}) =>
  mediaShelf({ media: [media()], deliverables: [content()], influencers: [influencer()], ...over });

describe("étagère des médias", () => {
  it("réunit les deux coffres, le plus récent d'abord", () => {
    expect(shelf().map((i) => i.key)).toEqual(["ugc:d1", "med:m1"]);
  });

  it("ne donne d'adresse publique qu'à ce qui en a une", () => {
    const [recu, biblio] = shelf();
    expect(biblio.url).toBe("https://cdn.test/photo.jpg");
    /* Le contenu reçu n'est pas sur le web : il se lit par la route de l'admin. */
    expect(recu.url).toBe("");
    expect(recu.src).toBe("/api/contenus/d1");
    expect(recu.kind).toBe("content");
  });

  it("range un contenu au nom de son créateur", () => {
    expect(shelf()[0].folder).toBe("Camille");
    /* Créateur supprimé : le fichier ne disparaît pas de l'écran pour autant. */
    expect(shelf({ influencers: [] })[0].folder).toBe("Créateur retiré");
  });

  it("déduit les dossiers, le fonds commun n'en étant pas un", () => {
    expect(shelfFolders(shelf())).toEqual([{ name: "Camille", count: 1 }]);
    expect(shelfFolders(shelf({ deliverables: [] }))).toEqual([]);
  });

  it("filtre par dossier, le fonds commun étant l'absence de dossier", () => {
    const items = shelf();
    expect(filterShelf(items, "Camille", "").map((i) => i.key)).toEqual(["ugc:d1"]);
    expect(filterShelf(items, "commun", "").map((i) => i.key)).toEqual(["med:m1"]);
    expect(filterShelf(items, "", "")).toHaveLength(2);
  });

  it("filtre par nature, et sait isoler ce qui vient des créateurs", () => {
    const items = shelf();
    expect(filterShelf(items, "", "photos").map((i) => i.key)).toEqual(["med:m1"]);
    expect(filterShelf(items, "", "videos").map((i) => i.key)).toEqual(["ugc:d1"]);
    expect(filterShelf(items, "", "prives").map((i) => i.key)).toEqual(["ugc:d1"]);
  });

  it("dit qu'un contenu a été rendu public, sans le déplacer", () => {
    const [recu] = shelf({ deliverables: [content({ mediaId: "m9" })] });
    expect(recu.mediaId).toBe("m9");
    /* Il reste servi par la route privée : la copie publique est un autre fichier. */
    expect(recu.src).toBe("/api/contenus/d1");
  });
});
