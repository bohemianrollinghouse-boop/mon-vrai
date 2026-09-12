import { describe, expect, it } from "vitest";
import { NEWSLETTER_TEMPLATES, PARTNER_WELCOME_ID, collectCrops, cropKey, isValidHref, renderTemplateBody, resolveHref, toPlainText, type CropReq, type RenderCtx } from "./render";

const ctx = (mode: RenderCtx["mode"], values: Record<string, string> = {}): RenderCtx => ({
  mode,
  base: "https://monvrai.fr",
  unsub: "https://monvrai.fr/u",
  brand: { shopName: "Mon Vrai", logoUrl: "https://monvrai.fr/email-logo.png", address: "Paris" },
  values,
});

describe("boutons de newsletter", () => {
  it("garde la cible du modèle par défaut, en e-mail comme en édition", () => {
    expect(renderTemplateBody("on-revient", ctx("email"))).toContain('<a href="https://monvrai.fr/catalogue" style=');
    expect(renderTemplateBody("on-revient", ctx("edit"))).toContain('data-href-k="cta"');
  });

  it("applique le lien édité et résout un chemin du site", () => {
    const html = renderTemplateBody("on-revient", ctx("email", { "href:cta": "/livres/le-visage", cta: "Voir le livre" }));
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

describe("pied de page", () => {
  const withBrand = (brand: Partial<RenderCtx["brand"]>): RenderCtx => ({ ...ctx("email"), brand: { ...ctx("email").brand, ...brand } });

  it("n'affiche que les réseaux renseignés, et rien si aucun", () => {
    const html = renderTemplateBody("on-revient", withBrand({ instagram: "https://instagram.com/monvrai" }));
    expect(html).toContain('href="https://instagram.com/monvrai"');
    expect(html).not.toContain("Facebook");
    expect(html).not.toContain("TikTok");
    expect(renderTemplateBody("on-revient", withBrand({}))).not.toContain("Instagram");
  });

  it("affiche l'adresse configurée, sans texte de remplacement quand elle manque", () => {
    expect(renderTemplateBody("on-revient", withBrand({ address: "78 avenue des Champs-Élysées, 75008 Paris" }))).toContain("Mon Vrai · 78 avenue des Champs-Élysées, 75008 Paris · ");
    const html = renderTemplateBody("on-revient", withBrand({ address: "" }));
    expect(html).not.toContain("[adresse]");
    expect(html).toContain("Mon Vrai · <a href=");
  });
});

/*
 * Le rendu e-mail a déjà été écrit comme une page web une fois : `display:grid`,
 * `object-fit`, `position:absolute`. L'aperçu (un navigateur) était parfait, et les
 * destinataires recevaient des colonnes empilées et des photos dont on ne voyait qu'un
 * coin, faute de recadrage. Ces tests interdisent le retour de ces propriétés.
 */
describe("compatibilité messagerie", () => {
  const ids = [...NEWSLETTER_TEMPLATES.map((t) => t.id), PARTNER_WELCOME_ID];

  // Propriétés que Gmail et Outlook retirent, et sans lesquelles la mise en page s'effondre.
  const bannies = ["display:flex", "display:grid", "grid-template-columns", "position:absolute", "object-fit", "aspect-ratio", "linear-gradient", "flex-direction", "inset:0"];

  it.each(ids)("« %s » n'utilise aucune propriété retirée en messagerie", (id) => {
    const html = renderTemplateBody(id, ctx("email", { "img:hero": "https://monvrai.fr/h.jpg", "img:g1": "https://monvrai.fr/a.jpg", "img:photo": "https://monvrai.fr/p.jpg" }));
    for (const prop of bannies) expect(html, prop).not.toContain(prop);
  });

  it.each(ids)("« %s » donne à chaque image ses attributs width/height", (id) => {
    const html = renderTemplateBody(id, ctx("email", { "img:g1": "https://monvrai.fr/a.jpg", "img:g2": "https://monvrai.fr/b.jpg", "img:photo": "https://monvrai.fr/p.jpg" }));
    for (const tag of html.match(/<img[^>]*>/g) ?? []) {
      // Le logo est la seule image dont la hauteur suffit : elle ne remplit pas de boîte.
      if (tag.includes("email-logo")) continue;
      expect(tag, tag).toMatch(/\swidth="\d+"/);
    }
  });

  it("garde l'aperçu éditable et l'e-mail sur la même ossature", () => {
    const values = { "img:g1": "https://monvrai.fr/a.jpg" };
    const edit = renderTemplateBody("coulisses", ctx("edit", values));
    // Les crayons et les zones éditables sont le seul ajout du mode édition.
    expect(edit).toContain("nl-pencil");
    expect(edit.replace(/<button[\s\S]*?<\/button>/g, "")).toContain("<table role=\"presentation\"");
  });
});

/*
 * Recadrage : le modèle décrit une boîte, le serveur fabrique une image à cette taille,
 * et le rendu définitif la substitue. Sans substitution, l'original repart tel quel —
 * un envoi ne doit jamais échouer parce qu'une image n'a pas pu être taillée.
 */
describe("recadrage des images", () => {
  const values = { "img:hero": "https://monvrai.fr/photo-4000px.jpg" };

  it("réclame la photo du héros à la taille exacte de sa boîte", () => {
    const reqs = collectCrops("on-revient", ctx("email", values));
    const hero = reqs.find((r) => r.url.includes("photo-4000px"));
    expect(hero).toMatchObject({ w: 552, h: 520, pos: "50% 40%", scrim: true });
  });

  it("substitue la dérivée quand elle existe, garde l'original sinon", () => {
    const [hero] = collectCrops("on-revient", ctx("email", values));
    const crops: Record<string, string> = { [cropKey(hero)]: "https://monvrai.fr/crop.jpg" };
    const img = (r: CropReq) => crops[cropKey(r)] ?? r.url;

    expect(renderTemplateBody("on-revient", { ...ctx("email", values), img })).toContain("https://monvrai.fr/crop.jpg");
    expect(renderTemplateBody("on-revient", ctx("email", values))).toContain("photo-4000px.jpg");
  });

  it("ne réclame rien pour un emplacement vide", () => {
    expect(collectCrops("coulisses", ctx("email"))).toHaveLength(0);
  });
});

describe("version texte", () => {
  it("ne laisse pas ressortir les tableaux fantômes d'Outlook", () => {
    const text = toPlainText(renderTemplateBody("on-revient", ctx("email")), "https://monvrai.fr/u");
    expect(text).not.toContain("mso");
    expect(text).not.toContain("endif");
    expect(text).toContain("128 réponses");
  });
});
