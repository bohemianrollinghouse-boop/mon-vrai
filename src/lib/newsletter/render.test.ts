import { describe, expect, it } from "vitest";
import { isValidHref, renderTemplateBody, resolveHref, type RenderCtx } from "./render";

const ctx = (mode: RenderCtx["mode"], values: Record<string, string> = {}): RenderCtx => ({
  mode,
  base: "https://monvrai.fr",
  unsub: "https://monvrai.fr/u",
  brand: { shopName: "Mon Vrai", logoUrl: "https://monvrai.fr/email-logo.png", address: "Paris" },
  values,
});

describe("boutons de newsletter", () => {
  it("garde la cible du modèle par défaut, en e-mail comme en édition", () => {
    expect(renderTemplateBody("lancement", ctx("email"))).toContain('<a href="https://monvrai.fr" style=');
    expect(renderTemplateBody("lancement", ctx("edit"))).toContain('data-href-k="cta"');
  });

  it("applique le lien édité et résout un chemin du site", () => {
    const html = renderTemplateBody("lancement", ctx("email", { "href:cta": "/livres/le-visage", cta: "Voir le livre" }));
    expect(html).toContain('<a href="https://monvrai.fr/livres/le-visage"');
    expect(html).toContain("Voir le livre");
    expect(html).not.toContain("nl-linkbtn");
  });

  it("propose le bouton 🔗 seulement en édition", () => {
    expect(renderTemplateBody("coulisses", ctx("edit"))).toContain('class="nl-linkbtn" data-k="cta2"');
    expect(renderTemplateBody("coulisses", ctx("email"))).not.toContain("nl-linkbtn");
  });
});

describe("resolveHref / isValidHref", () => {
  it("résout les chemins relatifs sur le site", () => {
    expect(resolveHref("/catalogue", "https://monvrai.fr/")).toBe("https://monvrai.fr/catalogue");
    expect(resolveHref("https://instagram.com/monvrai", "https://monvrai.fr")).toBe("https://instagram.com/monvrai");
  });

  it("accepte https, mailto et chemins ; refuse le reste", () => {
    expect(isValidHref("https://monvrai.fr/catalogue")).toBe(true);
    expect(isValidHref("mailto:contact@monvrai.fr")).toBe(true);
    expect(isValidHref("/livres/le-visage")).toBe(true);
    expect(isValidHref("javascript:alert(1)")).toBe(false);
    expect(isValidHref("//evil.com")).toBe(false);
    expect(isValidHref("monvrai.fr")).toBe(false);
  });
});
