import { describe, expect, it } from "vitest";
import { INSPIRATION_SLOTS, SCENE_SLOTS, VIDEO_SLOTS, guideMissing, guideView, rushCards } from "./content";
import { EMPTY_GUIDE_SETTINGS, type GuideSettings } from "@/lib/domain/types";

/*
 * Ce qui est vérifié ici tient en une phrase : les emplacements viennent du TEXTE, les
 * fichiers du réglage — et une place qu'on n'a pas remplie se dit, elle ne casse rien.
 */

const settings = (over: Partial<GuideSettings> = {}): GuideSettings => ({ ...EMPTY_GUIDE_SETTINGS, ...over });

describe("guide de création de contenu", () => {
  it("rend toutes les places, même vides", () => {
    const view = guideView(settings());
    expect(view.inspirations).toHaveLength(INSPIRATION_SLOTS.length);
    expect(view.scenes).toHaveLength(SCENE_SLOTS.length);
    expect(view.videos).toHaveLength(VIDEO_SLOTS.length);
    expect(view.videos.every((v) => v.url === "")).toBe(true);
    /* Les légendes restent lisibles sans image : le guide se lit déjà. */
    expect(view.videos[0].caption).toBeTruthy();
  });

  it("pose chaque fichier à sa place, et pas à celle d'à côté", () => {
    const view = guideView(
      settings({
        videos: [
          { key: "detail", url: "https://cdn.test/detail.mp4", poster: "" },
          { key: "large", url: "https://cdn.test/large.mp4", poster: "https://cdn.test/p.jpg" },
        ],
      }),
    );
    expect(view.videos.find((v) => v.key === "large")?.url).toBe("https://cdn.test/large.mp4");
    expect(view.videos.find((v) => v.key === "large")?.poster).toBe("https://cdn.test/p.jpg");
    expect(view.videos.find((v) => v.key === "detail")?.url).toBe("https://cdn.test/detail.mp4");
    expect(view.videos.find((v) => v.key === "serre")?.url).toBe("");
  });

  it("ignore une clé qui ne désigne aucune place", () => {
    const view = guideView(settings({ videos: [{ key: "inventee", url: "https://cdn.test/x.mp4", poster: "" }] }));
    expect(view.videos.every((v) => v.url === "")).toBe(true);
  });

  it("garde l'ordre du texte, quel que soit celui du réglage", () => {
    const view = guideView(settings({ inspirations: [{ key: "dessus", url: "c" }, { key: "geste", url: "a" }] }));
    expect(view.inspirations.map((s) => s.key)).toEqual(INSPIRATION_SLOTS.map((s) => s.key));
  });

  it("compte ce qu'il reste à poser", () => {
    const total = 1 + INSPIRATION_SLOTS.length + SCENE_SLOTS.length + VIDEO_SLOTS.length;
    expect(guideMissing(settings())).toBe(total);
    expect(guideMissing(settings({ hero: "https://cdn.test/h.jpg" }))).toBe(total - 1);
  });

  it("cite la durée réglée dans la première carte des rushes", () => {
    expect(rushCards(15)[0].title).toBe("15 secondes minimum par plan");
    expect(guideView(settings({ rushSeconds: 20 })).rushes[0].title).toBe("20 secondes minimum par plan");
  });

  it("choisit la phrase sur l'enfant, et n'en invente aucune", () => {
    expect(guideView(settings()).childNote).toContain("à votre choix");
    expect(guideView(settings({ childPolicy: "noFace" })).childNote).toContain("sans visage reconnaissable");
    expect(guideView(settings({ childPolicy: "face" })).childNote).toContain("bienvenu");
  });
});
