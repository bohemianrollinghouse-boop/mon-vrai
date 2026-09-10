import { describe, expect, it } from "vitest";
import { MenuTarget } from "./types";
import { resolveTarget } from "./menu-links";

/*
 * Les menus enregistrés avant la bascule doivent continuer d'être lus : `parseDoc`
 * lève sur un document invalide, et l'en-tête est rendu sur chaque page.
 */
describe("cibles de menu héritées", () => {
  it("une cible « page légale » devient la page correspondante", () => {
    const t = MenuTarget.parse({ kind: "policy", handle: "privacy-policy" });
    expect(t).toEqual({ kind: "page", slug: "privacy-policy" });
    expect(resolveTarget(t).href).toBe("/privacy-policy");
  });

  it("la clé système « story » devient la page Notre histoire", () => {
    expect(resolveTarget(MenuTarget.parse({ kind: "system", key: "story" })).href).toBe("/notre-histoire");
  });

  it("la clé système « policies » mène à la première page légale", () => {
    expect(resolveTarget(MenuTarget.parse({ kind: "system", key: "policies" })).href).toBe("/privacy-policy");
  });

  it("les cibles encore valides ne sont pas touchées", () => {
    expect(resolveTarget(MenuTarget.parse({ kind: "system", key: "catalogue" })).href).toBe("/catalogue");
    expect(resolveTarget(MenuTarget.parse({ kind: "page", slug: "notre-histoire" })).href).toBe("/notre-histoire");
    expect(resolveTarget(MenuTarget.parse({ kind: "url", href: "https://exemple.fr" })).external).toBe(true);
  });

  it("une cible franchement invalide reste refusée", () => {
    expect(MenuTarget.safeParse({ kind: "inconnu" }).success).toBe(false);
  });
});
