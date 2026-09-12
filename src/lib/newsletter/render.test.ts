import { describe, expect, it } from "vitest";
import { NEWSLETTER_TEMPLATES, PARTNER_WELCOME_ID, RESPONSIVE_CSS, collectCrops, cropKey, isValidHref, renderTemplateBody, resolveHref, toPlainText, type CropReq, type RenderCtx } from "./render";

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

/*
 * Le bouton de précommande arrivait après les quatre fiches produits — huit écrans plus
 * bas sur un téléphone. Il en faut un dès le haut, sans perdre celui du bas.
 */
describe("appel à la précommande", () => {
  it("propose « Précommander » en haut et en bas de « On revient »", () => {
    const html = renderTemplateBody("on-revient", ctx("email"));
    const positions = [...html.matchAll(/Précommander sur monvrai\.fr/g)].map((m) => m.index ?? -1);
    expect(positions).toHaveLength(2);
    // Le premier avant le bloc des thèmes, le second après les fiches produits.
    expect(positions[0]).toBeLessThan(html.indexOf("128 réponses"));
    expect(positions[1]).toBeGreaterThan(html.indexOf("Les Animaux de la forêt"));
    expect((html.match(/href="https:\/\/monvrai\.fr\/catalogue"/g) ?? []).length).toBe(2);
  });

  it("garde les deux boutons modifiables séparément", () => {
    const html = renderTemplateBody("on-revient", ctx("email", { ctaTop: "Je précommande", "href:ctaTop": "/livres" }));
    expect(html).toContain("Je précommande");
    expect(html).toContain('href="https://monvrai.fr/livres"');
    // Celui du bas n'a pas bougé.
    expect(html).toContain("Précommander sur monvrai.fr");
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

/*
 * Écran étroit. Une colonne repliée garde sa largeur maximale (281 px) : dans les ~310 px
 * utiles d'un téléphone, elle restait collée à gauche, avec un vide à droite — la « photo
 * pas centrée », revenue deux fois. Le centrage du conteneur la rattrape SANS feuille de
 * style ; les classes ne font que compléter, là où la feuille passe.
 */
describe("colonnes sur écran étroit", () => {
  const ids = [...NEWSLETTER_TEMPLATES.map((t) => t.id), PARTNER_WELCOME_ID];

  // « precommande » ne met rien en colonnes : le test vaut pour ce qu'il y a, et la
  // présence de colonnes est vérifiée une fois pour toutes juste après.
  it.each(ids)("« %s » centre ses colonnes repliées sans déplacer leur contenu", (id) => {
    const html = renderTemplateBody(id, ctx("email"));
    for (const w of html.match(/<div style="font-size:0;line-height:0[^"]*"/g) ?? []) expect(w, w).toContain("text-align:center");
    // Chaque colonne repose son propre alignement : le centrage ne vaut que pour les blocs.
    for (const col of html.match(/<div class="nl-col[^"]*" style="[^"]*"/g) ?? []) expect(col, col).toContain("text-align:left");
  });

  it("met bien des colonnes là où le modèle en demande", () => {
    const html = renderTemplateBody("on-revient", ctx("email"));
    expect((html.match(/<div class="nl-col/g) ?? []).length).toBe(8);
  });

  it("rend toute la largeur aux colonnes empilées, et les espace", () => {
    expect(RESPONSIVE_CSS).toContain(".nl-col{ max-width:100% !important; }");
    // La valeur compte : l'écart d'une colonne empilée doit valoir la gouttière (10 px)
    // et l'écart entre deux rangées, sinon l'espacement saute d'un cran sur deux.
    expect(RESPONSIVE_CSS).toContain(".nl-colgap{ padding-bottom:10px !important; }");
    // La dernière colonne n'ajoute rien sous elle : la section s'en charge.
    const html = renderTemplateBody("coulisses", ctx("email"));
    expect((html.match(/class="nl-col nl-colgap"/g) ?? []).length).toBe((html.match(/class="nl-col"/g) ?? []).length);
  });

  it("sépare les quatre thèmes du même espace une fois empilés", () => {
    const html = renderTemplateBody("on-revient", ctx("email"));
    // Les deux rangées de thèmes sont séparées par une ligne de tableau : elle doit valoir
    // la même chose que `nl-colgap`, sinon l'écart saute d'un cran sur deux (12/10/12).
    const entreRangees = /Les Véhicules[\s\S]*?Le Visage/.exec(html)?.[0] ?? "";
    expect(entreRangees).not.toBe("");
    const hauteurs = [...entreRangees.matchAll(/height="(\d+)"/g)].map((m) => m[1]);
    expect(hauteurs).toEqual(["10"]);
  });

  it("laisse l'image suivre sa colonne, et la couverture détourée garder sa taille", () => {
    expect(RESPONSIVE_CSS).toContain(".nl-fluid{ max-width:100% !important; }");
    const html = renderTemplateBody("nouveau-livre", ctx("email", { "img:g1": "https://monvrai.fr/a.jpg" }));
    expect(html).toContain('<img class="nl-fluid" src="https://monvrai.fr/a.jpg"');
    // La couverture posée sur un aplat n'est pas recadrée : l'étirer la déformerait.
    expect(html).toMatch(/<img src="[^"]*E7356459[^"]*" width="260"/);
  });

  it("libère les hauteurs posées pour aligner deux colonnes", () => {
    expect(RESPONSIVE_CSS).toContain(".nl-flexh{ height:auto !important; }");
    for (const id of ["nouveau-produit", "retour-stock", PARTNER_WELCOME_ID]) {
      expect(renderTemplateBody(id, ctx("email")), id).toMatch(/class="nl-flexh" style="[^"]*;height:\d+px/);
    }
  });

  it("réduit aussi le titre d'un héros, qui n'est pas un <h1>", () => {
    expect(RESPONSIVE_CSS).toContain("h1, .nl-h1{ font-size:30px !important");
    expect(renderTemplateBody("on-revient", ctx("email"))).toContain('<span class="nl-h1" style="font-size:40px');
    // En édition, la classe s'ajoute à celle qui rend le texte modifiable.
    expect(renderTemplateBody("on-revient", ctx("edit"))).toContain('class="nl-e nl-h1"');
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
