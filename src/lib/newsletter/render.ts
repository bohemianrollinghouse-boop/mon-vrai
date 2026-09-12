/*
 * Newsletters « Mon Vrai » : huit modèles riches, repris du design validé. Chaque modèle
 * est un corps d'e-mail de 600 px, autonome (en-tête logo, bannière, contenu, pied de
 * page). Le MÊME rendu sert deux usages, selon `mode` :
 *   - "email" : HTML propre, envoyé aux inscrits (styles en ligne, une colonne) ;
 *   - "edit"  : le même visuel, mais chaque texte est `contenteditable` et chaque image
 *               reçoit un crayon — c'est l'aperçu éditable de l'admin.
 * Les modifications (textes, images, liens) sont stockées dans `values` : clés nues pour
 * les textes, préfixe « img: » pour les images, préfixe « href: » pour la cible des boutons.
 * Une clé absente = le contenu par défaut.
 *
 * Module pur (pas d'accès base/réseau) : utilisable côté serveur (envoi) ET côté client
 * (aperçu éditable), d'où l'absence de `server-only`.
 *
 * ---------------------------------------------------------------------------------
 * UN CLIENT DE MESSAGERIE N'EST PAS UN NAVIGATEUR.
 *
 * Ces modèles ont d'abord été écrits comme des pages web : `display:grid`, `flex`,
 * `position:absolute`, `object-fit`, `aspect-ratio`, dégradés. L'aperçu de l'admin — rendu
 * dans Chrome — était parfait, et l'e-mail reçu ne l'était pas : Gmail et Outlook retirent
 * ces propriétés. Les colonnes s'empilaient, les titres posés sur une photo devenaient
 * blancs sur fond clair, et les images, privées de `object-fit: cover` dans un cadre à
 * hauteur fixe, s'affichaient à leur taille réelle — on n'en voyait qu'un coin.
 *
 * D'où les règles tenues ici, sans exception :
 *   - la mise en page passe par des tableaux et des `inline-block` à largeur maximale
 *     fixe (`cols`), jamais par `flex` ni `grid` ;
 *   - les images sont recadrées POUR DE VRAI avant l'envoi (`newsletter/crops.ts`) et
 *     rendues en `<img>` ordinaire avec ses attributs `width`/`height` — les seuls
 *     attributs qu'Outlook regarde ;
 *   - un texte posé sur une photo passe par l'attribut `background` d'un `<td>` (+ VML
 *     pour Outlook), et son voile sombre est cuit dans l'image, pas peint en CSS ;
 *   - un espacement est une ligne de tableau (`gap`), jamais une marge ;
 *   - tout ce qui peut être ignoré sans conséquence (coins arrondis, ombres) l'est.
 *
 * Et surtout : les deux modes produisent désormais la MÊME structure. L'aperçu ne peut
 * plus être plus beau que l'envoi, puisque c'est le même HTML — au crayon près.
 */

export type NewsletterMode = "email" | "edit";

export type Brand = {
  shopName: string;
  logoUrl: string;
  address: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
};

/** Une image à tailler : son adresse, la boîte visée, le point d'ancrage, le voile éventuel. */
export type CropReq = { url: string; w: number; h: number; pos: string; scrim?: boolean };

/** Identité d'un recadrage : sa demande, et rien d'autre — deux rendus identiques la partagent. */
export const cropKey = (r: CropReq): string => `${r.url}|${r.w}x${r.h}|${r.pos}|${r.scrim ? "s" : ""}`;

export type RenderCtx = {
  mode: NewsletterMode;
  base: string;
  unsub: string;
  brand: Brand;
  values: Record<string, string>;
  /**
   * Traduit une image d'origine en sa version recadrée. Fournie par l'envoi (deux passes :
   * on rend une fois pour recenser, on taille, on rend pour de bon). Absente, l'image
   * d'origine est utilisée telle quelle — c'est le cas de l'aperçu éditable.
   */
  img?: (req: CropReq) => string;
};

export type NewsletterTemplate = { id: string; label: string; description: string; subject: string };

/* Palette du design. */
const INK = "#111111";
const PAPER = "#FBF8F3";
const CANVAS = "#E9E6E0";
const SUBTLE = "#888888";
const GREEN = "#DCE5D6";
const GREEN_INK = "#3A4438";
const BLUE = "#E3E8F0";
const BLUE_INK = "#3A4250";
const PINK = "#F0E0E8";
const PINK_INK = "#5A3A4A";
const SAND = "#F3E9DC";
const SAND_INK = "#5A4A38";
const LINE = "#E2DDD4"; // filet des encadrés discrets
const TINTP = "#ECE6DC"; // fond des emplacements d'image vides
const HERO = "#2C2A27"; // aplat sous un héros : si l'image de fond ne charge pas, le titre blanc reste lisible
const FONT = "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const PIX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/* Géométrie. Tout est en pixels : un e-mail ne connaît pas les unités relatives. */
const CARD_W = 600;
const PAD = 24; // gouttière d'une section pleine largeur → 552 px de contenu
const COLPAD = 19; // gouttière d'une rangée en colonnes ; les 5 px manquants sont dans les colonnes
const COLS_W = CARD_W - COLPAD * 2; // 562 px à répartir — 281 par colonne sur deux, dont 10 de gouttière

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  { id: "on-revient", label: "On revient", description: "Retour aux inscrits de la première heure", subject: "On revient — et c'est vous qui avez choisi la suite" },
  { id: "nouveau-livre", label: "Nouveau livre", description: "Sortie d'un imagier", subject: "Un nouvel imagier : Les Animaux de compagnie" },
  { id: "nouveau-produit", label: "Nouveau produit", description: "Produit hors imagiers", subject: "La valise en palmier tressé est là" },
  { id: "nouvelle-categorie", label: "Nouvelle catégorie", description: "Nouvelle famille de produits", subject: "Une nouvelle série : « Moi »" },
  { id: "precommande", label: "Précommande ouverte", description: "Ouverture des précommandes", subject: "Les précommandes sont ouvertes — expédition le 25 décembre" },
  { id: "offre", label: "Offre / Code promo", description: "Promotion ou code", subject: "Les 9 imagiers, un offert — jusqu'à dimanche" },
  { id: "retour-stock", label: "Retour en stock", description: "Réimpression d'un titre", subject: "Ils sont de retour — Les Légumes, réimprimés" },
  { id: "coulisses", label: "Coulisses / Notre histoire", description: "Le pourquoi de Mon Vrai", subject: "Pourquoi une pomme, une vraie" },
];

export const templateById = (id: string): NewsletterTemplate | undefined => NEWSLETTER_TEMPLATES.find((t) => t.id === id);

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

/* ---------- Primitives de mise en page (compatibles messagerie) ---------- */

const TBL = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

/** Rangée pleine largeur de la carte. Le rembourrage est porté par un `<td>`, jamais par une marge. */
function sect(inner: string, pad: string, center = false, extra = ""): string {
  return `<table ${TBL} width="100%" style="border-collapse:collapse"><tr><td${center ? ' align="center"' : ""} style="padding:${pad}${center ? ";text-align:center" : ""}${extra}">${inner}</td></tr></table>`;
}

/**
 * Bloc coloré à coins arrondis. `bgcolor` double le style : Outlook ne lit que l'attribut.
 * `cls` sert aux règles de `RESPONSIVE_CSS` — seule « nl-flexh » est utilisée aujourd'hui,
 * sur les panneaux dont la hauteur n'est là que pour s'aligner sur la colonne voisine.
 */
function panel(inner: string, bg: string, pad: string, radius = 28, center = false, extra = "", cls = ""): string {
  return `<table ${TBL} width="100%" style="border-collapse:separate;background:${bg};border-radius:${radius}px"><tr><td bgcolor="${bg}"${center ? ' align="center"' : ""}${cls ? ` class="${cls}"` : ""} style="padding:${pad};background:${bg};border-radius:${radius}px${center ? ";text-align:center" : ""}${extra}">${inner}</td></tr></table>`;
}

/** Espace vertical. Une marge se perd sous Outlook ; une ligne de tableau, non. */
const gap = (h: number) => `<table ${TBL} width="100%"><tr><td height="${h}" style="height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;

/** Deux contenus aux extrémités d'une ligne (remplace `justify-content:space-between`). */
const between = (left: string, right: string) =>
  `<table ${TBL} width="100%"><tr><td align="left" valign="bottom" style="text-align:left">${left}</td><td align="right" valign="bottom" style="text-align:right">${right}</td></tr></table>`;

/*
 * Colonnes.
 *
 * Des blocs `inline-block` à largeur maximale fixe : sur un écran étroit ils passent
 * naturellement à la ligne. Outlook ignore `inline-block` : il reçoit un tableau fantôme
 * en commentaire conditionnel, invisible partout ailleurs. La gouttière appartient aux
 * colonnes (un rembourrage de 5 px de chaque côté) et non à un `gap`, qui n'existe pas
 * en messagerie.
 *
 * Deux détails font tout le rendu sur téléphone, et ont manqué longtemps :
 *
 *   - le conteneur est CENTRÉ. Une colonne repliée garde sa largeur maximale (281 px) :
 *     dans les ~310 px d'un téléphone, elle restait collée à gauche avec un vide à
 *     droite — la « photo pas centrée ». Le centrage ne change rien tant que les
 *     colonnes tiennent côte à côte, et les rattrape dès qu'elles s'empilent. Chaque
 *     colonne repose son propre `text-align:left` : son contenu ne bouge pas.
 *   - la classe `nl-col` laisse `RESPONSIVE_CSS` leur rendre toute la largeur sous
 *     620 px, et `nl-colgap` glisse un espace entre deux colonnes empilées (sauf après
 *     la dernière). Si la feuille de style est retirée, le centrage tient toujours.
 */
function cols(items: string[], widths?: number[]): string {
  const ws = (widths ?? items.map(() => COLS_W / items.length)).map((w) => Math.floor(w));
  const total = ws.reduce((a, b) => a + b, 0);
  const cells = items.map(
    (html, i) =>
      `<div class="nl-col${i < items.length - 1 ? " nl-colgap" : ""}" style="display:inline-block;width:100%;max-width:${ws[i]}px;vertical-align:top;text-align:left;font-size:14px;line-height:1.5"><table ${TBL} width="100%"><tr><td style="padding:0 5px">${html}</td></tr></table></div>`,
  );
  const inner = cells.map((cell, i) => `<td width="${ws[i]}" valign="top"><![endif]-->${cell}<!--[if mso]></td>`).join("");
  return `<div style="font-size:0;line-height:0;text-align:center"><!--[if mso]><table ${TBL} width="${total}"><tr>${inner}</tr></table><![endif]--></div>`;
}

/* ---------- Primitives éditables ---------- */

/**
 * Texte éditable. `def` peut contenir du HTML (par défaut) ; une valeur saisie est du
 * texte simple. `cls` sert aux règles de `RESPONSIVE_CSS` pour les textes qui ne sont pas
 * un `<h1>` — un titre de héros est un `<span>`, la règle sur `h1` ne l'atteindrait pas.
 */
function T(c: RenderCtx, key: string, def: string, style: string, tag = "span", cls = ""): string {
  const ov = c.values[key];
  const inner = ov == null ? def : nl2br(ov);
  if (c.mode === "email") return `<${tag}${cls ? ` class="${cls}"` : ""} style="${style}">${inner}</${tag}>`;
  return `<${tag} style="${style}" class="${cls ? `nl-e ${cls}` : "nl-e"}" data-k="${esc(key)}" contenteditable="true">${inner}</${tag}>`;
}

function pencil(key: string): string {
  return `<button type="button" class="nl-pencil" data-k="${esc(key)}" aria-label="Changer l'illustration" contenteditable="false">✎</button>`;
}

const imgUrl = (c: RenderCtx, key: string, def: string) => c.values["img:" + key] ?? def ?? "";
const filled = (url: string) => Boolean(url) && !url.startsWith("data:");

function imgAttrs(c: RenderCtx, key: string): string {
  return c.mode === "edit" ? `data-k="${esc(key)}" data-img="1"` : "";
}

/** Adresse de l'image telle qu'elle doit partir : recadrée quand le contexte sait le faire. */
const cropped = (c: RenderCtx, req: CropReq) => (c.img ? c.img(req) : req.url);

type Box = { w: number; h: number; pos?: string; radius?: number };

/*
 * Image recadrée dans une boîte.
 *
 * En e-mail : une `<img>` ordinaire, DÉJÀ taillée aux dimensions de la boîte par le
 * serveur, avec ses attributs `width`/`height`. Pas de `object-fit`, pas de `overflow`,
 * pas de hauteur imposée à une image — rien qu'un client de messagerie puisse retirer.
 *
 * En édition : la photo d'origine, recadrée par le navigateur dans une boîte de mêmes
 * dimensions. C'est la seule divergence entre les deux modes, et elle est voulue :
 * l'aperçu montre exactement le cadrage que le serveur va cuire dans l'image.
 */
function imgBox(c: RenderCtx, key: string, def: string, box: Box): string {
  const { w, h } = box;
  const pos = box.pos ?? "50% 50%";
  const radius = box.radius ?? 20;
  const url = imgUrl(c, key, def);
  const has = filled(url);

  if (c.mode === "email") {
    if (!has) return `<table ${TBL} width="100%"><tr><td bgcolor="${TINTP}" height="${h}" style="background:${TINTP};border-radius:${radius}px;height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
    // `nl-fluid` : sur téléphone, l'image suit la largeur de sa colonne au lieu de rester
    // en retrait à gauche. Les dérivées sont taillées en ×2, l'agrandissement ne coûte rien.
    return `<img class="nl-fluid" src="${esc(cropped(c, { url, w, h, pos }))}" width="${w}" height="${h}" alt="" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:${radius}px">`;
  }
  return `<div class="nl-imgwrap" style="width:100%;max-width:${w}px;height:${h}px;border-radius:${radius}px;overflow:hidden;position:relative${has ? "" : `;background:${TINTP}`}"><img ${imgAttrs(c, key)} src="${esc(has ? url : PIX)}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;object-position:${pos};border:0">${pencil(key)}</div>`;
}

/*
 * Héros : une photo pleine largeur avec un titre posé dessus.
 *
 * L'image est portée par l'attribut `background` d'un `<td>` — la seule forme d'image de
 * fond largement acceptée en messagerie — doublée d'un rectangle VML pour Outlook. Le
 * voile sombre qui rend le texte blanc lisible est cuit dans la photo au recadrage
 * (`scrim`), pas peint en CSS : un dégradé CSS ne survit pas au filtre de Gmail. Et si
 * l'image de fond ne s'affiche pas du tout, il reste l'aplat `HERO` — donc du blanc sur
 * du sombre, toujours lisible.
 */
function heroText(c: RenderCtx, key: string, box: Box, inner: string): string {
  const { w, h } = box;
  const pos = box.pos ?? "50% 50%";
  const radius = box.radius ?? 28;
  const url = imgUrl(c, key, "");
  const has = filled(url);

  if (c.mode === "edit") {
    return `<div class="nl-imgwrap" style="position:relative;width:100%;max-width:${w}px;height:${h}px;border-radius:${radius}px;overflow:hidden;background:${HERO}"><img ${imgAttrs(c, key)} src="${esc(has ? url : PIX)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${pos};border:0"><div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.62),rgba(0,0,0,0) 55%)"></div><div style="position:absolute;left:32px;right:32px;bottom:32px;color:#fff">${inner}</div>${pencil(key)}</div>`;
  }

  const u = has ? esc(cropped(c, { url, w, h, pos, scrim: true })) : "";
  const bg = u ? `background-image:url('${u}');background-position:center;background-size:cover;background-repeat:no-repeat;` : "";
  const vml = u
    ? `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${w}px;height:${h}px;"><v:fill type="frame" src="${u}" color="${HERO}" /><v:textbox inset="0,0,0,0"><![endif]-->`
    : "";
  const vmlEnd = u ? `<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->` : "";
  return `<table ${TBL} width="100%" style="border-collapse:separate"><tr><td${u ? ` background="${u}"` : ""} bgcolor="${HERO}" height="${h}" valign="bottom" style="height:${h}px;background-color:${HERO};${bg}border-radius:${radius}px">${vml}<table ${TBL} width="100%"><tr><td valign="bottom" height="${h}" style="height:${h}px;padding:32px;color:#fff">${inner}</td></tr></table>${vmlEnd}</td></tr></table>`;
}

/*
 * Image « produit » : une couverture de livre détourée, posée sur un aplat coloré. Pas de
 * recadrage — la transparence du PNG fait partie du visuel, et sa hauteur suit sa largeur.
 * Seule la largeur est imposée, en pixels, avec l'attribut que lit Outlook.
 */
function imgProduct(c: RenderCtx, key: string, def: string, w: number, radius = 10, shadow = ""): string {
  const url = imgUrl(c, key, def);
  const has = filled(url);
  const style = `display:inline-block;width:${w}px;max-width:100%;height:auto;border:0;border-radius:${radius}px${shadow}`;
  if (c.mode === "email") return has ? `<img src="${esc(url)}" width="${w}" alt="" style="${style}">` : `<span style="display:inline-block;width:${w}px;height:${Math.round(w * 1.15)}px;background:${TINTP};border-radius:${radius}px"></span>`;
  return `<span class="nl-imgwrap" style="position:relative;display:inline-block${has ? "" : `;background:${TINTP}`}"><img ${imgAttrs(c, key)} src="${esc(has ? url : PIX)}" alt="" style="${style}">${pencil(key)}</span>`;
}

/* ---------- Ossature commune ---------- */

/*
 * La carte de 600 px. Sa largeur est `100%` PLAFONNÉE à 600, jamais `width:600px` : un
 * tableau à largeur fixe ne rétrécit pas sur un téléphone — la carte débordait de l'écran
 * et les colonnes, faute de place pour se replier, restaient côte à côte et illisibles.
 * Outlook, lui, ne sait pas lire `max-width` : il reçoit un tableau fantôme de 600 px.
 */
const card = (inner: string) =>
  `<!--[if mso]><table ${TBL} width="${CARD_W}" align="center"><tr><td><![endif]-->
<table ${TBL} width="100%" align="center" style="width:100%;max-width:${CARD_W}px;background:${PAPER};border-collapse:collapse;box-shadow:0 20px 60px rgba(0,0,0,.12)"><tr><td bgcolor="${PAPER}" style="background:${PAPER}">${inner}</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->`;

/*
 * Barre haute d'une newsletter : « Voir dans le navigateur » à gauche, une note à
 * droite. Le lien pointe vers la version web du modèle (/newsletter/<id>) — c'était
 * auparavant un simple texte, donc un bouton mort dans toutes les newsletters.
 *
 * En mode édition, il ne navigue pas : l'aperçu de l'admin n'est pas un site.
 */
function topbar(c: RenderCtx, key: string, def: string, id: string): string {
  const href = `${c.base}/newsletter/${id}`;
  const left =
    c.mode === "email"
      ? `<a href="${esc(href)}" style="color:${SUBTLE};text-decoration:underline">Voir dans le navigateur</a>`
      : `<span style="text-decoration:underline">Voir dans le navigateur</span>`;
  return sect(between(left, T(c, key, def, "")), "12px 32px", false, `;font-size:11px;color:${SUBTLE};font-weight:600`);
}

/*
 * Barre haute d'un envoi transactionnel : une note, et rien qui ressemble à un bouton.
 * Pas de version web — l'e-mail est personnel, il n'a pas d'équivalent public.
 */
function topbarPlain(c: RenderCtx, key: string, def: string): string {
  return sect(T(c, key, def, ""), "12px 32px", false, `;text-align:right;font-size:11px;color:${SUBTLE};font-weight:600`);
}

const logo = (c: RenderCtx, align: "center" | "left" = "center") =>
  `<table ${TBL} width="100%"><tr><td align="${align}" style="padding:20px 32px 8px;text-align:${align}"><img src="${esc(c.brand.logoUrl)}" alt="${esc(c.brand.shopName)}" height="30" style="height:30px;border:0;display:inline-block"></td></tr></table>`;

/*
 * Pied de page : seuls les réseaux renseignés dans les réglages apparaissent (aucun :
 * pas de ligne), et l'adresse n'est affichée que si elle est connue — jamais de texte
 * de remplacement dans un e-mail réel.
 */
function footer(c: RenderCtx): string {
  const socials = (
    [
      [c.brand.instagram, "Instagram"],
      [c.brand.tiktok, "TikTok"],
      [c.brand.facebook, "Facebook"],
    ] as const
  )
    .filter(([href]) => Boolean(href))
    .map(([href, label]) => `<a href="${esc(href as string)}" style="color:${INK};text-decoration:none">${label}</a>`)
    .join(`<span style="color:${SUBTLE}">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);
  const socialsRow = socials ? `<div style="font-weight:700;color:${INK};font-size:12px;margin-bottom:10px">${socials}</div>\n` : "";
  const line = [esc(c.brand.shopName), c.brand.address ? esc(c.brand.address) : "", `<a href="${esc(c.unsub)}" style="color:${SUBTLE};text-decoration:underline">Se désinscrire</a>`].filter(Boolean).join(" · ");
  return sect(`${socialsRow}<span>${line}</span>`, "40px 40px 32px", true, `;font-size:11px;color:${SUBTLE};line-height:1.6`);
}

/** Cible d'un bouton : la valeur éditée (« href:clé ») sinon celle du modèle ; un chemin relatif est résolu sur le site. */
export function resolveHref(raw: string, base: string): string {
  const v = raw.trim();
  if (v.startsWith("/")) return `${base.replace(/\/$/, "")}${v}`;
  return v;
}
const btnHref = (c: RenderCtx, key: string, def: string) => resolveHref(c.values["href:" + key] ?? def, c.base);

/** Une URL acceptable pour un bouton : http(s), mailto, ou un chemin du site. */
export function isValidHref(raw: string): boolean {
  const v = raw.trim();
  return /^https?:\/\/[^\s]+$/i.test(v) || /^mailto:[^\s@]+@[^\s@]+$/i.test(v) || (/^\/[^\s]*$/.test(v) && !v.startsWith("//"));
}

/**
 * Lien éditable. En mode « edit », le clic ne navigue pas (géré par le composeur) et un
 * petit bouton 🔗 permet de changer la cible ; le texte reste éditable comme les autres.
 */
function linkT(c: RenderCtx, key: string, def: string, href: string, style: string): string {
  const target = btnHref(c, key, href);
  if (c.mode === "email") return `<a href="${esc(target)}" style="${style}">${T(c, key, def, "")}</a>`;
  return `<span class="nl-btnwrap" style="position:relative;display:inline-block"><a href="${esc(target)}" class="nl-btn" data-href-k="${esc(key)}" style="${style}">${T(c, key, def, "")}</a><button type="button" class="nl-linkbtn" data-k="${esc(key)}" aria-label="Changer le lien" title="Changer le lien" contenteditable="false">🔗</button></span>`;
}

/*
 * Bouton : un `<td>` coloré, pas un `<a>` rembourré. Outlook n'applique ni rembourrage ni
 * coins arrondis à un lien ; sur une cellule, il applique au moins le fond et le
 * rembourrage — le bouton reste un bouton, à angles droits.
 */
function btnShell(inner: string, dark: boolean): string {
  const bg = dark ? INK : "#fff";
  return `<table ${TBL} style="display:inline-block;vertical-align:middle;border-collapse:separate"><tr><td bgcolor="${bg}" align="center" style="background:${bg};border-radius:999px;padding:16px 28px;text-align:center">${inner}</td></tr></table>`;
}

const btn = (c: RenderCtx, key: string, def: string, href: string, dark = true) =>
  btnShell(linkT(c, key, def, href, `color:${dark ? "#fff" : INK};font-size:14px;font-weight:700;text-decoration:none;display:inline-block`), dark);

/** Bouton dont la cible n'est pas éditable : un lien personnel, injecté au moment de l'envoi. */
const btnFixed = (c: RenderCtx, key: string, def: string, href: string) =>
  btnShell(`<a href="${esc(href)}" style="color:#fff;font-size:14px;font-weight:700;text-decoration:none;display:inline-block">${T(c, key, def, "")}</a>`, true);

const eyebrow = (c: RenderCtx, key: string, def: string, color: string) =>
  T(c, key, def, `font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${color}`, "div");

/*
 * Pied de page transactionnel : même habillage, sans lien de désinscription. Une
 * invitation n'est pas un envoi marketing — il n'y a rien à quitter.
 */
function footerPlain(c: RenderCtx): string {
  const line = [esc(c.brand.shopName), c.brand.address ? esc(c.brand.address) : ""].filter(Boolean).join(" · ");
  return sect(`<span>${line}</span>`, "40px 40px 32px", true, `;font-size:11px;color:${SUBTLE};line-height:1.6`);
}

/* ---------- Modèles ---------- */

/*
 * Retour aux inscrits de la première heure : ceux qui avaient laissé leur adresse quand
 * les 500 premiers livres sont partis. Une lettre signée plutôt qu'une annonce — d'où le
 * bloc de remerciement avant les produits, et la signature de la fondatrice à la fin.
 */
function tplOnRevient(c: RenderCtx): string {
  // Les quatre thèmes tiennent dans un panneau rembourré de 32 px : 488 px de contenu,
  // donc 244 par colonne — et non la demi-largeur habituelle de la carte.
  const themeW = (CARD_W - PAD * 2 - 64) / 2; // 244
  const theme = (k: string, def: string) => panel(T(c, k, def, `font-size:14px;font-weight:700;color:${INK}`), "#fff", "14px 16px", 14, true);
  // Carte produit : la vignette est carrée (231 px = 271 px de colonne moins les 2 × 20 px
  // de rembourrage de la carte), donc recadrée à cette dimension exacte avant l'envoi.
  const produit = (n: number, def: string, name: string, price: string, desc: string) =>
    panel(
      `${imgBox(c, `p${n}`, def, { w: 231, h: 231, radius: 14 })}${gap(12)}${between(T(c, `p${n}t`, name, "font-size:15px;font-weight:700"), T(c, `p${n}p`, price, "font-size:13px;font-weight:700;color:#666"))}${gap(8)}${T(c, `p${n}d`, desc, "font-size:12px;color:#666;line-height:1.5")}`,
      "#fff",
      "20px",
      20,
    );

  const heroInner = `${T(c, "badge", "Vous étiez là au début", "background:#fff;color:#111;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:700;display:inline-block")}${gap(12)}${T(c, "title", "Vous nous aviez laissé votre adresse. Voilà la suite.", "font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.02em;color:#fff;display:block", "span", "nl-h1")}`;

  return card(`${topbar(c, "topnote", "Précommandes ouvertes · livraison offerte dès 30 €", "on-revient")}${logo(c)}
${sect(heroText(c, "hero", { w: 552, h: 520, pos: "50% 40%" }, heroInner), `16px ${PAD}px 0`)}
${sect(T(c, "intro", "Les nouveaux imagiers existent. Ils sont en précommande, et ce sont les vôtres avant d'être les nôtres.", "margin:0;font-size:16px;line-height:1.6;color:#444;display:block", "p"), "32px 40px 0", true)}
${sect(btn(c, "ctaTop", "Précommander sur monvrai.fr", `${c.base}/catalogue`), "20px 40px 0", true)}
${sect(panel(`${eyebrow(c, "thanksEy", "Merci d'avoir attendu", PINK_INK)}${T(c, "thanks1", "Quand les 500 premiers livres sont partis, vous avez été nombreux à laisser votre adresse pour savoir s'il y aurait une suite. Je n'avais pas de réponse à vous donner à ce moment-là. Il a fallu du temps, une pause, puis tout reprendre : une vraie identité, une vraie maison, un vrai site.", `margin:14px 0 12px;font-size:15px;line-height:1.65;color:${PINK_INK};display:block`, "p")}${T(c, "thanks2", "Vous avez attendu sans rien demander. C'est ce mail que je voulais pouvoir vous écrire.", `margin:0;font-size:15px;line-height:1.65;font-weight:700;color:${PINK_INK};display:block`, "p")}`, PINK, "36px 32px"), `24px ${PAD}px 0`)}
${sect(panel(`${eyebrow(c, "pollEy", "Ce que vous avez choisi", GREEN_INK)}${T(c, "pollTitle", "128 réponses. Quatre thèmes en sont sortis.", "margin:14px 0 10px;font-size:26px;line-height:1.1;font-weight:800;letter-spacing:-.02em;display:block", "h2")}${T(c, "pollText", "Vous nous avez dit quels imagiers vous manquaient vraiment. Nous n'en avons pas choisi d'autres : les quatre nouveautés sont exactement celles que vous avez demandées le plus souvent.", `margin:0;font-size:14px;line-height:1.6;color:${GREEN_INK};display:block`, "p")}${gap(18)}${cols([theme("t1", "Les Animaux de la ferme"), theme("t2", "Les Véhicules")], [themeW, themeW])}${gap(10)}${cols([theme("t3", "Le Visage"), theme("t4", "Les Animaux de la forêt")], [themeW, themeW])}`, GREEN, "36px 32px", 28, true), `10px ${PAD}px 0`)}
${sect(`${eyebrow(c, "newEy", "Les quatre nouveautés · 6–18 mois", SUBTLE)}${T(c, "newText", "Toujours six illustrations réalistes, une par double-page, sur fond blanc, sans texte.", "margin:10px 0 0;font-size:14px;line-height:1.6;color:#555;display:block", "p")}`, "32px 40px 0", true)}
${sect(cols([produit(1, "", "Les Animaux de la ferme", "10 €", "La vache, le mouton, la poule, le cochon, le cheval, la chèvre"), produit(2, "", "Les Véhicules", "10 €", "La voiture, le bus, le tracteur, le camion, le vélo, le train")]), `16px ${COLPAD}px 0`)}
${sect(cols([produit(3, "https://mon-vrai-2.myshopify.com/cdn/shop/files/A44725D9-D4D4-4C97-90C9-B3D403673526.png?v=1788625380&width=400", "Le Visage", "10 €", "Les yeux, le nez, la bouche, les oreilles, les cheveux, les mains"), produit(4, "", "Les Animaux de la forêt", "10 €", "Le renard, le cerf, le hérisson, l'écureuil, le sanglier, le hibou")]), `10px ${COLPAD}px 0`)}
${sect(`${btn(c, "cta", "Précommander sur monvrai.fr", `${c.base}/catalogue`)}${gap(10)}${T(c, "ctaNote", "Précommande · expédition dès le 25 décembre, tout dans un seul colis", `font-size:12px;color:${SUBTLE};font-weight:600`)}`, "28px 40px 0", true)}
${sect(panel(`${T(c, "signWords", "Mon Vrai est né pour mes enfants. Il grandit aujourd'hui pour les vôtres, et un peu grâce à vous.", `margin:0 0 18px;font-size:17px;line-height:1.6;color:${SAND_INK};display:block`, "p")}${T(c, "signName", "Myenndine", "font-size:14px;font-weight:800;display:block;margin-bottom:4px")}${T(c, "signRole", "Fondatrice de Mon Vrai", `font-size:12px;font-weight:600;color:${SUBTLE}`)}`, SAND, "32px", 24), `32px ${PAD}px 0`)}
${footer(c)}`);
}

function tplNouveauLivre(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Précommandes ouvertes · livraison offerte dès 30 €", "nouveau-livre")}${logo(c)}
${sect(`${eyebrow(c, "eyebrow", "Nouveau titre", GREEN_INK)}${T(c, "title", "Les Animaux de compagnie", "margin:12px 0;font-size:36px;line-height:1.05;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Le chien, le chat, le lapin, le poisson, le hamster, la tortue. Six illustrations réalistes de ceux qu'on croise tous les jours à la maison.", "margin:0;font-size:15px;line-height:1.6;color:#555;display:block", "p")}`, "24px 40px 0", true)}
${sect(panel(imgProduct(c, "product", "https://mon-vrai-2.myshopify.com/cdn/shop/files/E7356459-D918-4329-A6A0-06A35F014BAE_6e4ac200-f7f9-4748-b1fd-e9b256c7db21.png?v=1788625340&width=600", 260, 10, ";box-shadow:0 24px 50px rgba(0,0,0,.18)"), GREEN, "32px", 28, true), `24px ${PAD}px 0`)}
${sect(cols([imgBox(c, "g1", "", { w: 271, h: 300 }), imgBox(c, "g2", "", { w: 271, h: 300, pos: "50% 70%" })]), `10px ${COLPAD}px 0`)}
${sect(`${T(c, "body", "Le livre, puis la figurine, puis le vrai chat du voisin : c'est exactement comme ça que le lien se fait. Nommez ce qu'il regarde. Laissez-le explorer.", "margin:0 0 14px;font-size:15px;line-height:1.6;color:#444;display:block", "p")}${btn(c, "cta", "Précommander · 10 €", c.base)}${gap(10)}${T(c, "ctaNote", "Expédition dès le 25 déc.", `font-size:12px;color:${SUBTLE};font-weight:600`)}`, "28px 40px 0", true)}
${footer(c)}`);
}

function tplNouveauProduit(c: RenderCtx): string {
  // Le panneau des caractéristiques fait la hauteur de la photo voisine : deux colonnes
  // `inline-block` ne s'étirent pas l'une sur l'autre, la hauteur se pose donc à la main
  // (280 px de photo = 232 px de contenu + 2 × 24 px de rembourrage).
  const specs = panel(
    `${T(c, "f1", "Palmier naturel, tressé main", `font-size:13px;font-weight:600;line-height:1.5;color:${SAND_INK};display:block`)}${gap(12)}${T(c, "f2", "32 × 22 × 12 cm — les 9 livres à plat", `font-size:13px;font-weight:600;line-height:1.5;color:${SAND_INK};display:block`)}${gap(12)}${T(c, "f3", "Lien de fermeture, sans métal ni plastique", `font-size:13px;font-weight:600;line-height:1.5;color:${SAND_INK};display:block`)}${gap(20)}${T(c, "priceNote", "[Prix à confirmer]", `font-size:11px;color:${SAND_INK};font-weight:700;display:block;margin-bottom:4px`)}${T(c, "price", "29 €", "font-size:26px;font-weight:800;letter-spacing:-.02em")}`,
    SAND,
    "24px",
    20,
    false,
    ";height:232px",
    "nl-flexh",
  );
  return card(`${topbar(c, "topnote", "Livraison offerte dès 30 €", "nouveau-produit")}${logo(c)}
${sect(imgBox(c, "hero", "", { w: 552, h: 520, pos: "50% 60%", radius: 28 }), `24px ${PAD}px 0`)}
${sect(`${eyebrow(c, "eyebrow", "Nouveau produit", SAND_INK)}${T(c, "title", "La valise en palmier tressé", "margin:12px 0;font-size:36px;line-height:1.05;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Tressée à la main, elle accueille les neuf imagiers et se ferme d'un lien. Pour ranger la collection, l'emporter chez les grands-parents, ou l'offrir toute prête.", "margin:0;font-size:15px;line-height:1.6;color:#555;display:block", "p")}`, "32px 40px 0")}
${sect(cols([imgBox(c, "g1", "", { w: 271, h: 280 }), specs]), `24px ${COLPAD}px 0`)}
${sect(`${btn(c, "cta", "Découvrir la valise", c.base)}&nbsp;${btn(c, "cta2", "Valise + 9 imagiers", c.base, false)}`, "28px 40px 0", true)}
${footer(c)}`);
}

function tplNouvelleCategorie(c: RenderCtx): string {
  // Vignette produit : une couverture détourée posée au centre d'un carré teinté.
  const tile = (k: string, def: string, name: string, price: string, desc: string) =>
    panel(
      `${panel(imgProduct(c, k, def, 134, 6, ";box-shadow:0 12px 28px rgba(0,0,0,.12)"), PINK, "40px 20px", 14, true)}${gap(12)}${between(T(c, `${k}t`, name, "font-size:15px;font-weight:700"), T(c, `${k}p`, price, "font-size:13px;font-weight:700;color:#666"))}${gap(8)}${T(c, `${k}d`, desc, "font-size:12px;color:#666;line-height:1.5")}`,
      "#fff",
      "20px",
      20,
    );
  return card(`${topbar(c, "topnote", "Précommandes ouvertes · livraison offerte dès 30 €", "nouvelle-categorie")}${logo(c)}
${sect(panel(`${eyebrow(c, "eyebrow", "Nouvelle série", PINK_INK)}${T(c, "title", "« Moi » : ce qu'il porte, ce qu'il est.", "margin:14px 0;font-size:44px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Après les animaux et l'alimentation, une série sur l'enfant lui-même : son visage, ses vêtements. Les mots qu'il entend le plus au quotidien.", `margin:0;font-size:15px;line-height:1.6;color:${PINK_INK};display:block`, "p")}`, PINK, "40px 36px"), `24px ${PAD}px 0`)}
${sect(cols([imgBox(c, "g1", "", { w: 271, h: 360 }), imgBox(c, "g2", "", { w: 271, h: 360 })]), `10px ${COLPAD}px 0`)}
${sect(cols([tile("p1", "https://mon-vrai-2.myshopify.com/cdn/shop/files/A44725D9-D4D4-4C97-90C9-B3D403673526.png?v=1788625380&width=400", "Le Visage", "10 €", "Les yeux, le nez, la bouche, les oreilles, les cheveux, les mains"), tile("p2", "https://mon-vrai-2.myshopify.com/cdn/shop/files/1FBF7100-A70C-45B6-9302-39F80D3C98DA.png?v=1788622633&width=400", "Les Vêtements", "10 €", "Le body, le t-shirt, le pantalon, la culotte, les chaussettes, les chaussons")]), `10px ${COLPAD}px 0`)}
${sect(`${btn(c, "cta", "Découvrir la série Moi", c.base)}${gap(10)}${T(c, "ctaNote", "Les deux titres : 20 €, expédiés ensemble dès le 25 décembre", `font-size:12px;color:${SUBTLE};font-weight:600`)}`, "28px 40px 0", true)}
${footer(c)}`);
}

function tplPrecommande(c: RenderCtx): string {
  const step = (n: string, bg: string, ink: string, body: string) =>
    `<table ${TBL} width="100%"><tr><td width="28" valign="top" style="width:28px"><table ${TBL}><tr><td bgcolor="${bg}" width="28" height="28" align="center" style="width:28px;height:28px;line-height:28px;border-radius:999px;background:${bg};color:${ink};font-size:12px;font-weight:800;text-align:center">${n}</td></tr></table></td><td width="16" style="width:16px">&nbsp;</td><td valign="top" style="font-size:14px;line-height:1.5;color:#444">${body}</td></tr></table>`;
  return card(`${topbar(c, "topnote", "Livraison offerte dès 30 €", "precommande")}${logo(c)}
${sect(panel(`${eyebrow(c, "eyebrow", "Précommandes ouvertes", GREEN)}${T(c, "title", "Réservez vos imagiers, on s'occupe du reste.", "margin:16px 0;font-size:42px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block;color:#fff", "h1")}${T(c, "intro", "Les neuf titres sont en fabrication. Précommandez aujourd'hui, nous expédions tout dans un seul colis à partir du 25 décembre.", "margin:0 0 16px;font-size:15px;line-height:1.6;color:#BBB;display:block", "p")}${btn(c, "cta", "Précommander", c.base, false)}`, INK, "40px 36px", 28, true, ";color:#fff"), `24px ${PAD}px 0`)}
${sect(imgBox(c, "hero", "", { w: 552, h: 420, pos: "50% 65%", radius: 28 }), `10px ${PAD}px 0`)}
${sect(panel(`${T(c, "stepsTitle", "Comment ça marche", "font-size:16px;font-weight:800;display:block;margin-bottom:16px")}${step("1", GREEN, GREEN_INK, T(c, "step1", "Vous précommandez — paiement à la commande, code promo cumulable.", ""))}${gap(12)}${step("2", BLUE, BLUE_INK, T(c, "step2", "Nous fabriquons — cartonné, papier FSC, encre de soja, en Europe.", ""))}${gap(12)}${step("3", SAND, SAND_INK, T(c, "step3", "Nous expédions dès le 25 décembre — un seul colis, suivi par e-mail, point relais ou domicile.", ""))}`, "#fff", "28px", 24), `10px ${PAD}px 0`)}
${sect(linkT(c, "link", "Voir les 9 titres →", c.base, "font-size:13px;font-weight:700;border-bottom:1.5px solid #111;color:#111;text-decoration:none"), "28px 40px 0", true)}
${footer(c)}`);
}

function tplOffre(c: RenderCtx): string {
  // La carte de l'offre chevauchait la photo d'un cran (marge négative) : aucune messagerie
  // ne l'accepte, et Gmail la retire purement. Elle est posée juste dessous.
  return card(`${topbar(c, "topnote", "Offre valable jusqu'au dimanche 21 septembre", "offre")}${logo(c)}
${sect(imgBox(c, "hero", "", { w: 552, h: 440, pos: "50% 60%", radius: 28 }), `24px ${PAD}px 0`)}
${sect(panel(`${eyebrow(c, "eyebrow", "Offre collection", SAND_INK)}${T(c, "title", "Les 9 imagiers,<br>Le Visage offert.", "margin:12px 0;font-size:38px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Complétez la collection : dès 80 € dans le panier, le neuvième livre est ajouté gratuitement.", `margin:0;font-size:14px;line-height:1.55;color:${SAND_INK};display:block`, "p")}${gap(14)}${T(c, "codeLabel", "Votre code", `font-size:11px;font-weight:700;color:${SAND_INK};display:block;margin-bottom:6px`)}${T(c, "code", "COLLECTION", "background:#fff;padding:14px 20px;border-radius:14px;font-size:22px;font-weight:800;letter-spacing:.1em;display:inline-block")}${gap(14)}${btn(c, "cta", "J'en profite", c.base)}`, SAND, "32px 24px", 24, true), `10px ${PAD}px 0`)}
${sect(`${T(c, "body", "Neuf thèmes, six illustrations réalistes chacun : les animaux, les fruits et légumes, les objets de la maison, les véhicules, le visage et les vêtements. De quoi nommer presque tout le quotidien d'un enfant de 6 à 18 mois.", "margin:0 0 12px;font-size:14px;line-height:1.6;color:#555;display:block", "p")}${T(c, "terms", "Cumulable avec la livraison offerte. Jusqu'au 21 septembre, 23h59.", `font-size:12px;color:${SUBTLE};font-weight:600`)}`, "32px 40px 0", true)}
${sect(cols([imgBox(c, "g1", "", { w: 271, h: 240 }), imgBox(c, "g2", "", { w: 271, h: 240 })]), `28px ${COLPAD}px 0`)}
${footer(c)}`);
}

function tplRetourStock(c: RenderCtx): string {
  // Colonne de droite : la photo (195) + 10 px + le panneau (155 + 2 × 20 de rembourrage)
  // font les 400 px de la photo de gauche. Deux `inline-block` ne s'alignent pas seuls.
  const right = `${imgBox(c, "g2", "", { w: 236, h: 195, pos: "50% 80%" })}${gap(10)}${panel(`${T(c, "insideLabel", "Dedans", `font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${SAND_INK};display:block;margin-bottom:6px`)}${T(c, "inside", "Les haricots, le poireau, la courge, le chou-fleur, le brocoli, la carotte", `font-size:13px;font-weight:600;line-height:1.5;color:${SAND_INK}`)}`, SAND, "20px", 20, false, ";height:155px", "nl-flexh")}`;
  // Le titre et l'achat sont deux colonnes, pas quatre cellules d'une même ligne : sur un
  // téléphone, une ligne de tableau ne se replie pas et forçait l'e-mail hors de l'écran.
  const prodInfo = `<table ${TBL} width="100%"><tr><td width="72" valign="middle" style="width:72px">${panel(imgProduct(c, "product", "https://mon-vrai-2.myshopify.com/cdn/shop/files/7235B3F0-A987-4357-B101-FAEAA1DCB73E.png?v=1788622635&width=200", 43, 4, ";box-shadow:0 6px 14px rgba(0,0,0,.12)"), SAND, "14px", 16, true)}</td><td width="20" style="width:20px">&nbsp;</td><td valign="middle">${T(c, "prodName", "Les Légumes", "font-size:16px;font-weight:800;display:block;margin-bottom:4px")}${T(c, "prodMeta", "6–18 mois · 14 × 14 cm · en stock, expédié sous 48 h", `font-size:12px;color:${SUBTLE};font-weight:600`)}</td></tr></table>`;
  const prodAchat = `<div style="text-align:right">${T(c, "price", "10 €", "font-size:20px;font-weight:800;display:block;margin-bottom:8px")}${btn(c, "cta", "Commander", c.base)}</div>`;
  const prodRow = cols([prodInfo, prodAchat], [330, 166]);
  return card(`${topbar(c, "topnote", "Livraison offerte dès 30 €", "retour-stock")}${logo(c)}
${sect(`${T(c, "badge", "De retour en stock", `background:${GREEN};color:${GREEN_INK};border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;display:inline-block`)}${T(c, "title", "Les Légumes sont revenus.", "margin:12px 0;font-size:38px;line-height:1.04;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Épuisé en trois semaines, le titre préféré des mangeurs de chou-fleur est réimprimé. Cette fois, on a vu plus large.", "margin:0;font-size:15px;line-height:1.6;color:#555;display:block", "p")}`, "24px 40px 0", true)}
${sect(cols([imgBox(c, "g1", "", { w: 306, h: 400, radius: 24 }), right], [316, 246]), `28px ${COLPAD}px 0`)}
${sect(panel(prodRow, "#fff", "24px 28px", 24), `10px ${PAD}px 0`)}
${sect(T(c, "note", "Vous l'aviez demandé par e-mail ? Vous êtes les premiers prévenus — le stock est limité.", `font-size:13px;color:${SUBTLE};font-weight:600`), "28px 40px 0", true)}
${footer(c)}`);
}

function tplCoulisses(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Coulisses · n° 1", "coulisses")}${logo(c)}
${sect(imgBox(c, "hero", "", { w: 552, h: 440, radius: 28 }), `24px ${PAD}px 0`)}
${sect(`${eyebrow(c, "eyebrow", "Coulisses", SUBTLE)}${T(c, "title", "Pourquoi une pomme, une vraie.", "margin:14px 0 18px;font-size:36px;line-height:1.08;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "p1", "Tout a commencé par une pomme posée à côté d'un livre. Sur la page, une pomme dessinée, rouge, brillante, avec un sourire. Dans la main, une pomme un peu jaune, un peu tachée. L'enfant regardait l'une, puis l'autre, et ne faisait pas le lien.", "margin:0 0 18px;font-size:16px;line-height:1.7;color:#444;display:block", "p")}${T(c, "p2", "On a voulu un livre où ce lien se fait tout seul. Une illustration réaliste, isolée sur fond blanc, sans texte ni décor. Rien qui détourne le regard. Juste la chose, et son nom, dit par vous.", "margin:0;font-size:16px;line-height:1.7;color:#444;display:block", "p")}`, "32px 48px 0")}
${sect(cols([imgBox(c, "g1", "", { w: 271, h: 320 }), imgBox(c, "g2", "", { w: 271, h: 320 })]), `28px ${COLPAD}px 0`)}
${sect(`${T(c, "p3", "Chaque illustration réaliste est faite en studio, avec de vrais objets : la cuillère de la cuisine, le savon de la salle de bain, la chaise haute. On les choisit ordinaires, pour qu'ils ressemblent à ceux de chez vous.", "margin:0 0 18px;font-size:16px;line-height:1.7;color:#444;display:block", "p")}${panel(`${T(c, "quote", "« Il a posé sa main sur la cuillère de la page, puis a cherché la vraie sur la table. »", "font-size:18px;font-weight:800;letter-spacing:-.01em;line-height:1.3;display:block;margin-bottom:6px")}${T(c, "quoteBy", "Une maman, à la crèche des Petits Pas", `font-size:12px;font-weight:600;color:${GREEN_INK}`)}`, GREEN, "24px 28px", 20)}`, "28px 48px 0")}
${sect(`${btn(c, "cta", "Lire notre histoire", c.base)}&nbsp;${btn(c, "cta2", "Voir les imagiers", c.base, false)}`, "32px 40px 0", true)}
${footer(c)}`);
}

/** Identifiant du gabarit d'invitation. Absent de NEWSLETTER_TEMPLATES : il ne se
 *  compose pas dans l'onglet Newsletter mais dans l'onglet Influenceurs. */
export const PARTNER_WELCOME_ID = "partenaire-bienvenue";

/*
 * Invitation d'un partenaire à ouvrir son espace.
 *
 * Deux règles tiennent ce gabarit : pas un mot sur une commission — elle est
 * facultative, et un partenaire qui n'en a pas ne doit apprendre nulle part qu'elle
 * existe —, et pas de lien de désinscription, puisque l'envoi est transactionnel.
 *
 * Le bouton mène à un lien personnel, différent à chaque envoi : sa cible est injectée
 * au rendu et n'est donc pas modifiable ici, contrairement aux textes.
 *
 * Les cartes « code » et « lien » gardent les clés s1/s2 de la version précédente : le
 * texte est le même et une invitation déjà retouchée dans l'admin ne doit pas revenir à
 * ses valeurs par défaut. Seule la carte « sélection », nouvelle, porte des clés neuves.
 */
function tplPartenaireBienvenue(c: RenderCtx): string {
  const href = c.values.__activation || "#";
  const carte = (bg: string, ink: string, n: string, kt: string, titre: string, kd: string, desc: string) =>
    panel(
      `<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${ink}">${n}</div>${T(c, kt, titre, "display:block;margin-top:8px;font-size:17px;font-weight:800;letter-spacing:-.01em")}${T(c, kd, desc, `margin:10px 0 0;font-size:13px;line-height:1.6;color:${ink};display:block`, "p")}`,
      bg,
      "20px 18px",
      20,
      false,
      ";height:150px",
      "nl-flexh",
    );

  // La photo est facultative : tant qu'aucune n'est choisie, le bloc disparaît de
  // l'e-mail au lieu d'y laisser un aplat vide — l'invitation part telle quelle, sans
  // le passage par un composeur qu'ont les newsletters. Le crayon reste dans l'admin.
  const photoVide = c.mode === "email" && !filled(imgUrl(c, "photo", ""));
  const photo = photoVide ? "" : sect(imgBox(c, "photo", "", { w: 552, h: 300, radius: 28 }), `24px ${PAD}px 0`);

  return card(`${topbarPlain(c, "topnote", "Invitation personnelle")}${logo(c, "left")}
${sect(`${eyebrow(c, "eyebrow", "Bienvenue", SUBTLE)}${T(c, "title", "Entrez dans votre espace partenaire", "margin:14px 0 0;font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Vous y retrouverez la sélection qu'on a faite pour vous, votre code, votre lien de suivi et les commandes qui vous sont attribuées, mises à jour chaque heure.", "margin:16px 0 0;font-size:16px;line-height:1.6;color:#444;display:block", "p")}`, "28px 40px 0", true)}
${sect(btnFixed(c, "cta", "Créer mon espace et recevoir ma sélection", href), "28px 40px 0", true)}
${sect(panel(T(c, "note", "Au premier accès, vous choisissez votre mot de passe et renseignez votre adresse de livraison. Ce lien est personnel et valable deux semaines.", `font-size:12px;line-height:1.6;color:${SUBTLE};font-weight:600`), PAPER, "14px 18px", 14, true, `;border:1px solid ${LINE}`), `16px ${PAD}px 0`)}
${sect(panel(`${eyebrow(c, "panelEy", "Ce qui vous attend dans votre espace", SAND_INK)}${T(c, "panelTitle", "Une sélection d'imagiers et de produits, à vous de choisir dedans.", "margin:12px 0 0;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.02em;display:block", "h2")}${T(c, "panelText", "On a réuni en amont les livres et les produits qui vous correspondent. Vous choisissez ce que vous voulez parmi eux, vous renseignez votre adresse à la création du compte, et on vous l'expédie.", `margin:12px 0 0;font-size:15px;line-height:1.65;color:${SAND_INK};display:block`, "p")}`, SAND, "32px"), `24px ${PAD}px 0`)}
${sect(cols([carte(PINK, PINK_INK, "01", "s3t", "Votre sélection", "s3d", "Les imagiers et produits réunis pour vous : vous choisissez, on expédie."), carte(GREEN, GREEN_INK, "02", "s1t", "Votre code", "s1d", "Une remise pour votre communauté, appliquée automatiquement."), carte(BLUE, BLUE_INK, "03", "s2t", "Votre lien", "s2d", "À coller en bio ou en story : les commandes vous sont attribuées 30 jours.")]), `10px ${COLPAD}px 0`)}
${photo}
${sect(T(c, "outro", "Une question ? Répondez simplement à cet e-mail, une vraie personne vous lira.", "margin:0;font-size:14px;line-height:1.6;color:#555;display:block", "p"), "28px 40px 0", true)}
${footerPlain(c)}`);
}

const BUILDERS: Record<string, (c: RenderCtx) => string> = {
  [PARTNER_WELCOME_ID]: tplPartenaireBienvenue,
  "on-revient": tplOnRevient,
  "nouveau-livre": tplNouveauLivre,
  "nouveau-produit": tplNouveauProduit,
  "nouvelle-categorie": tplNouvelleCategorie,
  precommande: tplPrecommande,
  offre: tplOffre,
  "retour-stock": tplRetourStock,
  coulisses: tplCoulisses,
};

/** Corps du modèle (carte 600 px), en mode « email » (propre) ou « edit » (éditable). */
export function renderTemplateBody(id: string, ctx: RenderCtx): string {
  const build = BUILDERS[id] ?? BUILDERS["on-revient"];
  return build(ctx);
}

/**
 * Recense les images d'un modèle et la boîte où chacune doit tenir : première des deux
 * passes de l'envoi. Le rendu produit est jeté — seul compte ce qu'il a réclamé.
 */
export function collectCrops(id: string, ctx: Omit<RenderCtx, "img">): CropReq[] {
  const reqs: CropReq[] = [];
  renderTemplateBody(id, {
    ...ctx,
    img: (r) => {
      reqs.push(r);
      return r.url;
    },
  });
  return reqs;
}

/*
 * Feuille de style du rendu. Volontairement courte : tout ce qui compte vraiment est déjà
 * en ligne, et cette feuille ne fait que RATTRAPER l'écran étroit — un client qui la
 * retire (Outlook, quelques webmails) affiche une mise en page correcte, jamais cassée.
 *
 * Elle est partagée avec la version web (« Voir dans le navigateur ») : un téléphone y
 * voit la même chose que dans sa boîte aux lettres, ce qui est tout l'intérêt du lien.
 */
export const RESPONSIVE_CSS = `
  img{ -ms-interpolation-mode:bicubic; }
  table{ mso-table-lspace:0pt; mso-table-rspace:0pt; }
  @media only screen and (max-width:620px){
    /* Une colonne repliée prend toute la largeur — sinon elle garde ses 281 px au milieu
       d'un écran de 310 et paraît décalée. */
    .nl-col{ max-width:100% !important; }
    /* 10 px, et pas une autre valeur : c'est exactement la gouttière qui sépare deux
       colonnes côte à côte, et l'écart que les modèles laissent entre deux rangées de
       colonnes. Une fois tout empilé sur un téléphone, les quatre thèmes — comme les
       quatre fiches produits — sont donc séparés du même espace partout. */
    .nl-colgap{ padding-bottom:10px !important; }
    /* Une photo de boîte suit sa colonne ; une couverture détourée garde sa taille. */
    .nl-fluid{ max-width:100% !important; }
    /* Une hauteur posée pour aligner deux colonnes n'a plus d'objet une fois empilées. */
    .nl-flexh{ height:auto !important; }
    h1, .nl-h1{ font-size:30px !important; line-height:1.08 !important; }
    h2{ font-size:22px !important; }
  }
`;

/** Enveloppe l'e-mail complet (doctype + fond + centrage 600 px). */
export function wrapEmail(id: string, ctx: RenderCtx, preheader: string): string {
  const body = renderTemplateBody(id, ctx);
  return `<!doctype html><html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="x-ua-compatible" content="ie=edge"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(ctx.brand.shopName)}</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>${RESPONSIVE_CSS}</style></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table ${TBL} width="100%" style="background:${CANVAS}"><tr><td align="center" style="padding:28px 12px">
${body}
</td></tr></table></body></html>`;
}

/** Version texte brut (repli sans images) à partir du rendu e-mail. */
export function toPlainText(html: string, unsub: string): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Les commentaires conditionnels portent les tableaux fantômes d'Outlook : ce n'est
    // pas du contenu, et il ne doit pas ressortir en clair dans la version texte.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${text}\n\nSe désinscrire : ${unsub}`;
}
