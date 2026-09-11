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

export type RenderCtx = {
  mode: NewsletterMode;
  base: string;
  unsub: string;
  brand: Brand;
  values: Record<string, string>;
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
const TINTP = "#ECE6DC"; // fond des emplacements d'image vides
const FONT = "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const PIX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  { id: "on-revient", label: "On revient", description: "Retour aux inscrits de la première heure", subject: "Vous nous aviez laissé votre adresse. Voilà la suite." },
  { id: "nouveau-livre", label: "Nouveau livre", description: "Sortie d'un titre", subject: "Un chien, un chat, un lapin — nouveau : Les Animaux de compagnie" },
  { id: "nouveau-produit", label: "Nouveau produit", description: "Un produit autre qu'un livre", subject: "La valise Mon Vrai — pour ranger, emporter, offrir" },
  { id: "nouvelle-categorie", label: "Nouvelle catégorie", description: "Une nouvelle série", subject: "Nouvelle série « Moi » — le visage, les vêtements" },
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

/* ---------- Primitives éditables ---------- */

/** Texte éditable. `def` peut contenir du HTML (par défaut) ; une valeur saisie est du texte simple. */
function T(c: RenderCtx, key: string, def: string, style: string, tag = "span"): string {
  const ov = c.values[key];
  const inner = ov == null ? def : nl2br(ov);
  if (c.mode === "email") return `<${tag} style="${style}">${inner}</${tag}>`;
  return `<${tag} style="${style}" class="nl-e" data-k="${esc(key)}" contenteditable="true">${inner}</${tag}>`;
}

function pencil(key: string): string {
  return `<button type="button" class="nl-pencil" data-k="${esc(key)}" aria-label="Changer l'illustration" contenteditable="false">✎</button>`;
}

const imgUrl = (c: RenderCtx, key: string, def: string) => c.values["img:" + key] ?? def ?? "";
const filled = (url: string) => Boolean(url) && !url.startsWith("data:");

function imgAttrs(c: RenderCtx, key: string): string {
  return c.mode === "edit" ? `data-k="${esc(key)}" data-img="1"` : "";
}

/** Image « couvrante » dans un cadre à dimensions fixes (recadrage centré). */
function imgBox(c: RenderCtx, key: string, def: string, wrapStyle: string, pos = "50% 50%"): string {
  const url = imgUrl(c, key, def);
  const has = filled(url);
  const style = `display:block;width:100%;height:100%;object-fit:cover;object-position:${pos};border:0`;
  if (c.mode === "email") {
    return has
      ? `<div style="${wrapStyle};overflow:hidden"><img src="${esc(url)}" alt="" style="${style}"></div>`
      : `<div style="${wrapStyle};overflow:hidden;background:${TINTP}"></div>`;
  }
  return `<div class="nl-imgwrap" style="${wrapStyle};overflow:hidden;position:relative${has ? "" : `;background:${TINTP}`}"><img ${imgAttrs(c, key)} src="${esc(has ? url : PIX)}" alt="" style="${style}">${pencil(key)}</div>`;
}

/** Image qui remplit son conteneur positionné (héros avec superposition). */
function imgFill(c: RenderCtx, key: string, def: string, pos = "50% 50%"): string {
  const url = imgUrl(c, key, def);
  const has = filled(url);
  const style = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${pos};border:0`;
  if (c.mode === "email") return has ? `<img src="${esc(url)}" alt="" style="${style}">` : "";
  return `<img ${imgAttrs(c, key)} src="${esc(has ? url : PIX)}" alt="" style="${style}">${pencil(key)}`;
}

/** Image « produit » (couverture posée sur un fond coloré) : largeur fixe, hauteur auto, ombre. */
function imgProduct(c: RenderCtx, key: string, def: string, style: string): string {
  const url = imgUrl(c, key, def);
  const has = filled(url);
  if (c.mode === "email") return has ? `<img src="${esc(url)}" alt="" style="${style}">` : `<span style="display:inline-block;${style};background:${TINTP};min-height:120px"></span>`;
  return `<span class="nl-imgwrap" style="position:relative;display:inline-block${has ? "" : `;background:${TINTP}`}"><img ${imgAttrs(c, key)} src="${esc(has ? url : PIX)}" alt="" style="${style}">${pencil(key)}</span>`;
}

/* ---------- Ossature commune ---------- */

const card = (inner: string) => `<div style="background:${PAPER};box-shadow:0 20px 60px rgba(0,0,0,.12);border-radius:2px">${inner}</div>`;

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
  return `<div style="display:flex;justify-content:space-between;padding:12px 32px;font-size:11px;color:${SUBTLE};font-weight:600">${left}${T(c, key, def, "")}</div>`;
}

/*
 * Barre haute d'un envoi transactionnel : une note, et rien qui ressemble à un bouton.
 * Pas de version web — l'e-mail est personnel, il n'a pas d'équivalent public.
 */
function topbarPlain(c: RenderCtx, key: string, def: string): string {
  return `<div style="display:flex;justify-content:flex-end;padding:12px 32px;font-size:11px;color:${SUBTLE};font-weight:600">${T(c, key, def, "")}</div>`;
}

const logo = (c: RenderCtx) => `<div style="padding:20px 32px 8px;text-align:center"><img src="${esc(c.brand.logoUrl)}" alt="${esc(c.brand.shopName)}" style="height:30px;border:0"></div>`;

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
    .join("");
  const socialsRow = socials ? `<div style="display:flex;gap:16px;justify-content:center;font-weight:700;color:${INK};font-size:12px;margin-bottom:10px">${socials}</div>\n` : "";
  const line = [esc(c.brand.shopName), c.brand.address ? esc(c.brand.address) : "", `<a href="${esc(c.unsub)}" style="color:${SUBTLE};text-decoration:underline">Se désinscrire</a>`].filter(Boolean).join(" · ");
  return `<div style="padding:40px 40px 32px;text-align:center;font-size:11px;color:${SUBTLE};line-height:1.6">
${socialsRow}<span>${line}</span></div>`;
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

const btn = (c: RenderCtx, key: string, def: string, href: string, dark = true) =>
  linkT(c, key, def, href, `display:inline-block;background:${dark ? INK : "#fff"};color:${dark ? "#fff" : INK};padding:16px 28px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none`);

const eyebrow = (c: RenderCtx, key: string, def: string, color: string) =>
  T(c, key, def, `font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${color}`, "div");

/*
 * Pied de page transactionnel : même habillage, sans lien de désinscription. Une
 * invitation n'est pas un envoi marketing — il n'y a rien à quitter.
 */
function footerPlain(c: RenderCtx): string {
  const line = [esc(c.brand.shopName), c.brand.address ? esc(c.brand.address) : ""].filter(Boolean).join(" · ");
  return `<div style="padding:40px 40px 32px;text-align:center;font-size:11px;color:${SUBTLE};line-height:1.6"><span>${line}</span></div>`;
}

/* ---------- Modèles ---------- */

/*
 * Retour aux inscrits de la première heure : ceux qui avaient laissé leur adresse quand
 * les 500 premiers livres sont partis. Une lettre signée plutôt qu'une annonce — d'où le
 * bloc de remerciement avant les produits, et la signature de la fondatrice à la fin.
 */
function tplOnRevient(c: RenderCtx): string {
  const theme = (k: string, def: string) => `<div style="background:#fff;border-radius:14px;padding:14px 16px">${T(c, k, def, `font-size:14px;font-weight:700;color:${INK}`)}</div>`;
  const produit = (n: number, def: string, name: string, price: string, desc: string) =>
    `<div style="background:#fff;border-radius:20px;padding:20px"><div style="margin-bottom:12px">${imgBox(c, `p${n}`, def, "aspect-ratio:1;border-radius:14px")}</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">${T(c, `p${n}t`, name, "font-size:15px;font-weight:700")}${T(c, `p${n}p`, price, "font-size:13px;font-weight:700;color:#666")}</div>${T(c, `p${n}d`, desc, "font-size:12px;color:#666;line-height:1.5")}</div>`;

  return card(`${topbar(c, "topnote", "Précommandes ouvertes · livraison offerte dès 30 €", "on-revient")}${logo(c)}
<div style="margin:16px 24px 0;border-radius:28px;overflow:hidden;position:relative;height:520px;background:${TINTP}">${imgFill(c, "hero", "", "50% 40%")}<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.6),rgba(0,0,0,0) 55%)"></div><div style="position:absolute;left:32px;right:32px;bottom:32px;display:flex;flex-direction:column;gap:12px;color:#fff">${T(c, "badge", "Vous étiez là au début", "align-self:flex-start;background:#fff;color:#111;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:700")}${T(c, "title", "Vous nous aviez laissé votre adresse. Voilà la suite.", "font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.02em", "span")}</div></div>
<div style="padding:32px 40px 0;text-align:center">${T(c, "intro", "Les nouveaux imagiers existent. Ils sont en précommande, et ce sont les vôtres avant d'être les nôtres.", "margin:0;font-size:16px;line-height:1.6;color:#444;display:block", "p")}</div>
<div style="margin:24px 24px 0;background:${PINK};border-radius:28px;padding:36px 32px">${eyebrow(c, "thanksEy", "Merci d'avoir attendu", PINK_INK)}${T(c, "thanks1", "Quand les 500 premiers livres sont partis, vous avez été nombreux à laisser votre adresse pour savoir s'il y aurait une suite. Je n'avais pas de réponse à vous donner à ce moment-là. Il a fallu du temps, une pause, puis tout reprendre : une vraie identité, une vraie maison, un vrai site.", `margin:14px 0 12px;font-size:15px;line-height:1.65;color:${PINK_INK};display:block`, "p")}${T(c, "thanks2", "Vous avez attendu sans rien demander. C'est ce mail que je voulais pouvoir vous écrire.", `margin:0;font-size:15px;line-height:1.65;font-weight:700;color:${PINK_INK};display:block`, "p")}</div>
<div style="margin:10px 24px 0;background:${GREEN};border-radius:28px;padding:36px 32px">${eyebrow(c, "pollEy", "Ce que vous avez choisi", GREEN_INK)}${T(c, "pollTitle", "128 réponses. Quatre thèmes en sont sortis.", "margin:14px 0 10px;font-size:26px;line-height:1.1;font-weight:800;letter-spacing:-.02em;display:block", "h2")}${T(c, "pollText", "Vous nous avez dit quels imagiers vous manquaient vraiment. Nous n'en avons pas choisi d'autres : les quatre nouveautés sont exactement celles que vous avez demandées le plus souvent.", `margin:0;font-size:14px;line-height:1.6;color:${GREEN_INK};display:block`, "p")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">${theme("t1", "Les Animaux de la ferme")}${theme("t2", "Les Véhicules")}${theme("t3", "Le Visage")}${theme("t4", "Les Animaux de la forêt")}</div></div>
<div style="padding:32px 40px 0;text-align:center">${eyebrow(c, "newEy", "Les quatre nouveautés · 6–18 mois", SUBTLE)}${T(c, "newText", "Toujours six illustrations réalistes, une par double-page, sur fond blanc, sans texte.", "margin:10px 0 0;font-size:14px;line-height:1.6;color:#555;display:block", "p")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 24px 0">${produit(1, "", "Les Animaux de la ferme", "10 €", "La vache, le mouton, la poule, le cochon, le cheval, la chèvre")}${produit(2, "", "Les Véhicules", "10 €", "La voiture, le bus, le tracteur, le camion, le vélo, le train")}${produit(3, "https://mon-vrai-2.myshopify.com/cdn/shop/files/A44725D9-D4D4-4C97-90C9-B3D403673526.png?v=1788625380&width=400", "Le Visage", "10 €", "Les yeux, le nez, la bouche, les oreilles, les cheveux, les mains")}${produit(4, "", "Les Animaux de la forêt", "10 €", "Le renard, le cerf, le hérisson, l'écureuil, le sanglier, le hibou")}</div>
<div style="padding:28px 40px 0;text-align:center">${btn(c, "cta", "Précommander sur monvrai.fr", `${c.base}/catalogue`)}<div style="margin-top:10px">${T(c, "ctaNote", "Précommande · expédition dès le 25 décembre, tout dans un seul colis", `font-size:12px;color:${SUBTLE};font-weight:600`)}</div></div>
<div style="margin:32px 24px 0;background:${SAND};border-radius:24px;padding:32px">${T(c, "signWords", "Mon Vrai est né pour mes enfants. Il grandit aujourd'hui pour les vôtres, et un peu grâce à vous.", `margin:0 0 18px;font-size:17px;line-height:1.6;color:${SAND_INK};display:block`, "p")}${T(c, "signName", "Myenndine", "font-size:14px;font-weight:800;display:block;margin-bottom:4px")}${T(c, "signRole", "Fondatrice de Mon Vrai", `font-size:12px;font-weight:600;color:${SUBTLE}`)}</div>
${footer(c)}`);
}

function tplNouveauLivre(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Précommandes ouvertes · livraison offerte dès 30 €", "nouveau-livre")}${logo(c)}
<div style="padding:24px 40px 0;text-align:center">${eyebrow(c, "eyebrow", "Nouveau titre", GREEN_INK)}${T(c, "title", "Les Animaux de compagnie", "margin:12px 0;font-size:36px;line-height:1.05;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Le chien, le chat, le lapin, le poisson, le hamster, la tortue. Six illustrations réalistes de ceux qu'on croise tous les jours à la maison.", "margin:0 auto;font-size:15px;line-height:1.6;color:#555;max-width:440px;display:block", "p")}</div>
<div style="margin:24px 24px 0;background:${GREEN};border-radius:28px;padding:32px;text-align:center">${imgProduct(c, "product", "https://mon-vrai-2.myshopify.com/cdn/shop/files/E7356459-D918-4329-A6A0-06A35F014BAE_6e4ac200-f7f9-4748-b1fd-e9b256c7db21.png?v=1788625340&width=600", "width:260px;border-radius:10px;box-shadow:0 24px 50px rgba(0,0,0,.18)")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 24px 0">${imgBox(c, "g1", "", "height:300px;border-radius:20px")}${imgBox(c, "g2", "", "height:300px;border-radius:20px", "50% 70%")}</div>
<div style="padding:28px 40px 0;text-align:center">${T(c, "body", "Le livre, puis la figurine, puis le vrai chat du voisin : c'est exactement comme ça que le lien se fait. Nommez ce qu'il regarde. Laissez-le explorer.", "margin:0 0 14px;font-size:15px;line-height:1.6;color:#444;display:block", "p")}<div style="display:flex;justify-content:center;gap:10px;align-items:center">${btn(c, "cta", "Précommander · 10 €", c.base)}${T(c, "ctaNote", "Expédition dès le 25 déc.", `font-size:12px;color:${SUBTLE};font-weight:600`)}</div></div>
${footer(c)}`);
}

function tplNouveauProduit(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Livraison offerte dès 30 €", "nouveau-produit")}${logo(c)}
<div style="margin:24px 24px 0;border-radius:28px;overflow:hidden;height:520px;position:relative;background:${TINTP}">${imgFill(c, "hero", "", "50% 60%")}</div>
<div style="padding:32px 40px 0">${eyebrow(c, "eyebrow", "Nouveau produit", SAND_INK)}${T(c, "title", "La valise en palmier tressé", "margin:12px 0;font-size:36px;line-height:1.05;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Tressée à la main, elle accueille les neuf imagiers et se ferme d'un lien. Pour ranger la collection, l'emporter chez les grands-parents, ou l'offrir toute prête.", "margin:0;font-size:15px;line-height:1.6;color:#555;display:block", "p")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:24px 24px 0;align-items:stretch">${imgBox(c, "g1", "", "min-height:280px;border-radius:20px")}<div style="background:${SAND};border-radius:20px;padding:24px;display:flex;flex-direction:column;justify-content:space-between;gap:16px"><div style="display:flex;flex-direction:column;gap:12px;font-size:13px;font-weight:600;color:${SAND_INK};line-height:1.5">${T(c, "f1", "Palmier naturel, tressé main", "")}${T(c, "f2", "32 × 22 × 12 cm — les 9 livres à plat", "")}${T(c, "f3", "Lien de fermeture, sans métal ni plastique", "")}</div><div>${T(c, "priceNote", "[Prix à confirmer]", `font-size:11px;color:${SAND_INK};font-weight:700;display:block;margin-bottom:4px`)}${T(c, "price", "29 €", "font-size:26px;font-weight:800;letter-spacing:-.02em")}</div></div></div>
<div style="padding:28px 40px 0;text-align:center">${btn(c, "cta", "Découvrir la valise", c.base)} ${btn(c, "cta2", "Valise + 9 imagiers", c.base, false)}</div>
${footer(c)}`);
}

function tplNouvelleCategorie(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Précommandes ouvertes · livraison offerte dès 30 €", "nouvelle-categorie")}${logo(c)}
<div style="margin:24px 24px 0;background:${PINK};border-radius:28px;padding:40px 36px">${eyebrow(c, "eyebrow", "Nouvelle série", PINK_INK)}${T(c, "title", "« Moi » : ce qu'il porte, ce qu'il est.", "margin:14px 0;font-size:44px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Après les animaux et l'alimentation, une série sur l'enfant lui-même : son visage, ses vêtements. Les mots qu'il entend le plus au quotidien.", `margin:0;font-size:15px;line-height:1.6;color:${PINK_INK};display:block`, "p")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 24px 0">${imgBox(c, "g1", "", "height:360px;border-radius:20px")}${imgBox(c, "g2", "", "height:360px;border-radius:20px")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 24px 0">
<div style="background:#fff;border-radius:20px;padding:20px"><div style="aspect-ratio:1;border-radius:14px;background:${PINK};display:flex;align-items:center;justify-content:center;margin-bottom:12px">${imgProduct(c, "p1", "https://mon-vrai-2.myshopify.com/cdn/shop/files/A44725D9-D4D4-4C97-90C9-B3D403673526.png?v=1788625380&width=400", "width:58%;border-radius:6px;box-shadow:0 12px 28px rgba(0,0,0,.12)")}</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">${T(c, "p1t", "Le Visage", "font-size:15px;font-weight:700")}${T(c, "p1p", "10 €", "font-size:13px;font-weight:700;color:#666")}</div>${T(c, "p1d", "Les yeux, le nez, la bouche, les oreilles, les cheveux, les mains", "font-size:12px;color:#666;line-height:1.5")}</div>
<div style="background:#fff;border-radius:20px;padding:20px"><div style="aspect-ratio:1;border-radius:14px;background:${PINK};display:flex;align-items:center;justify-content:center;margin-bottom:12px">${imgProduct(c, "p2", "https://mon-vrai-2.myshopify.com/cdn/shop/files/1FBF7100-A70C-45B6-9302-39F80D3C98DA.png?v=1788622633&width=400", "width:58%;border-radius:6px;box-shadow:0 12px 28px rgba(0,0,0,.12)")}</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">${T(c, "p2t", "Les Vêtements", "font-size:15px;font-weight:700")}${T(c, "p2p", "10 €", "font-size:13px;font-weight:700;color:#666")}</div>${T(c, "p2d", "Le body, le t-shirt, le pantalon, la culotte, les chaussettes, les chaussons", "font-size:12px;color:#666;line-height:1.5")}</div>
</div>
<div style="padding:28px 40px 0;text-align:center">${btn(c, "cta", "Découvrir la série Moi", c.base)}<div style="margin-top:10px">${T(c, "ctaNote", "Les deux titres : 20 €, expédiés ensemble dès le 25 décembre", `font-size:12px;color:${SUBTLE};font-weight:600`)}</div></div>
${footer(c)}`);
}

function tplPrecommande(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Livraison offerte dès 30 €", "precommande")}${logo(c)}
<div style="margin:24px 24px 0;background:${INK};color:#fff;border-radius:28px;padding:40px 36px;text-align:center">${eyebrow(c, "eyebrow", "Précommandes ouvertes", GREEN)}${T(c, "title", "Réservez vos imagiers, on s'occupe du reste.", "margin:16px 0;font-size:42px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Les neuf titres sont en fabrication. Précommandez aujourd'hui, nous expédions tout dans un seul colis à partir du 25 décembre.", "margin:0 auto 16px;font-size:15px;line-height:1.6;color:#BBB;max-width:440px;display:block", "p")}${btn(c, "cta", "Précommander", c.base, false)}</div>
<div style="margin:10px 24px 0;border-radius:28px;overflow:hidden;height:420px;position:relative;background:${TINTP}">${imgFill(c, "hero", "", "50% 65%")}</div>
<div style="margin:10px 24px 0;background:#fff;border-radius:24px;padding:28px">${T(c, "stepsTitle", "Comment ça marche", "font-size:16px;font-weight:800;display:block;margin-bottom:16px")}
<div style="display:grid;grid-template-columns:auto 1fr;gap:12px 16px;font-size:14px;line-height:1.5;color:#444;align-items:start">
<span style="width:28px;height:28px;border-radius:999px;background:${GREEN};color:${GREEN_INK};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">1</span>${T(c, "step1", "Vous précommandez — paiement à la commande, code promo cumulable.", "")}
<span style="width:28px;height:28px;border-radius:999px;background:${BLUE};color:${BLUE_INK};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">2</span>${T(c, "step2", "Nous fabriquons — cartonné, papier FSC, encre de soja, en Europe.", "")}
<span style="width:28px;height:28px;border-radius:999px;background:${SAND};color:${SAND_INK};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">3</span>${T(c, "step3", "Nous expédions dès le 25 décembre — un seul colis, suivi par e-mail, point relais ou domicile.", "")}
</div></div>
<div style="padding:28px 40px 0;text-align:center">${linkT(c, "link", "Voir les 9 titres →", c.base, "font-size:13px;font-weight:700;border-bottom:1.5px solid #111;color:#111;text-decoration:none")}</div>
${footer(c)}`);
}

function tplOffre(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Offre valable jusqu'au dimanche 21 septembre", "offre")}${logo(c)}
<div style="margin:24px 24px 0;border-radius:28px;overflow:hidden;position:relative;height:440px;background:${TINTP}">${imgFill(c, "hero", "", "50% 60%")}</div>
<div style="margin:-60px 40px 0;position:relative;background:${SAND};border-radius:24px;padding:32px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.12)">${eyebrow(c, "eyebrow", "Offre collection", SAND_INK)}${T(c, "title", "Les 9 imagiers,<br>Le Visage offert.", "margin:12px 0;font-size:38px;line-height:1.02;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Complétez la collection : dès 80 € dans le panier, le neuvième livre est ajouté gratuitement.", `margin:0 auto;font-size:14px;line-height:1.55;color:${SAND_INK};max-width:400px;display:block`, "p")}<div style="margin-top:14px">${T(c, "codeLabel", "Votre code", `font-size:11px;font-weight:700;color:${SAND_INK};display:block;margin-bottom:6px`)}${T(c, "code", "COLLECTION", "background:#fff;padding:14px 28px;border-radius:14px;font-size:22px;font-weight:800;letter-spacing:.12em;display:inline-block")}</div><div style="margin-top:14px">${btn(c, "cta", "J'en profite", c.base)}</div></div>
<div style="padding:32px 40px 0;text-align:center">${T(c, "body", "Neuf thèmes, six illustrations réalistes chacun : les animaux, les fruits et légumes, les objets de la maison, les véhicules, le visage et les vêtements. De quoi nommer presque tout le quotidien d'un enfant de 6 à 18 mois.", "margin:0 0 12px;font-size:14px;line-height:1.6;color:#555;display:block", "p")}${T(c, "terms", "Cumulable avec la livraison offerte. Jusqu'au 21 septembre, 23h59.", `font-size:12px;color:${SUBTLE};font-weight:600`)}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:28px 24px 0">${imgBox(c, "g1", "", "height:240px;border-radius:20px")}${imgBox(c, "g2", "", "height:240px;border-radius:20px")}</div>
${footer(c)}`);
}

function tplRetourStock(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Livraison offerte dès 30 €", "retour-stock")}${logo(c)}
<div style="padding:24px 40px 0;text-align:center">${T(c, "badge", "De retour en stock", `background:${GREEN};color:${GREEN_INK};border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;display:inline-block`)}${T(c, "title", "Les Légumes sont revenus.", "margin:12px 0;font-size:38px;line-height:1.04;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Épuisé en trois semaines, le titre préféré des mangeurs de chou-fleur est réimprimé. Cette fois, on a vu plus large.", "margin:0 auto;font-size:15px;line-height:1.6;color:#555;max-width:440px;display:block", "p")}</div>
<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px;padding:28px 24px 0">${imgBox(c, "g1", "", "height:400px;border-radius:24px")}<div style="display:flex;flex-direction:column;gap:10px">${imgBox(c, "g2", "", "height:195px;border-radius:20px", "50% 80%")}<div style="background:${SAND};border-radius:20px;padding:20px;flex:1;display:flex;flex-direction:column;justify-content:center">${T(c, "insideLabel", "Dedans", `font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${SAND_INK};display:block;margin-bottom:6px`)}${T(c, "inside", "Les haricots, le poireau, la courge, le chou-fleur, le brocoli, la carotte", `font-size:13px;font-weight:600;line-height:1.5;color:${SAND_INK}`)}</div></div></div>
<div style="margin:10px 24px 0;background:#fff;border-radius:24px;padding:24px 28px;display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:center"><div style="width:72px;height:72px;border-radius:16px;background:${SAND};display:flex;align-items:center;justify-content:center">${imgProduct(c, "product", "https://mon-vrai-2.myshopify.com/cdn/shop/files/7235B3F0-A987-4357-B101-FAEAA1DCB73E.png?v=1788622635&width=200", "width:60%;border-radius:4px;box-shadow:0 6px 14px rgba(0,0,0,.12)")}</div><div>${T(c, "prodName", "Les Légumes", "font-size:16px;font-weight:800;display:block;margin-bottom:4px")}${T(c, "prodMeta", "6–18 mois · 14 × 14 cm · en stock, expédié sous 48 h", `font-size:12px;color:${SUBTLE};font-weight:600`)}</div><div style="text-align:right">${T(c, "price", "10 €", "font-size:20px;font-weight:800;display:block;margin-bottom:8px")}${btn(c, "cta", "Commander", c.base)}</div></div>
<div style="padding:28px 40px 0;text-align:center">${T(c, "note", "Vous l'aviez demandé par e-mail ? Vous êtes les premiers prévenus — le stock est limité.", `font-size:13px;color:${SUBTLE};font-weight:600`)}</div>
${footer(c)}`);
}

function tplCoulisses(c: RenderCtx): string {
  return card(`${topbar(c, "topnote", "Coulisses · n° 1", "coulisses")}${logo(c)}
<div style="margin:24px 24px 0;border-radius:28px;overflow:hidden;height:440px;position:relative;background:${TINTP}">${imgFill(c, "hero", "")}</div>
<div style="padding:32px 48px 0">${eyebrow(c, "eyebrow", "Coulisses", SUBTLE)}${T(c, "title", "Pourquoi une pomme, une vraie.", "margin:14px 0 18px;font-size:36px;line-height:1.08;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "p1", "Tout a commencé par une pomme posée à côté d'un livre. Sur la page, une pomme dessinée, rouge, brillante, avec un sourire. Dans la main, une pomme un peu jaune, un peu tachée. L'enfant regardait l'une, puis l'autre, et ne faisait pas le lien.", "margin:0 0 18px;font-size:16px;line-height:1.7;color:#444;display:block", "p")}${T(c, "p2", "On a voulu un livre où ce lien se fait tout seul. Une illustration réaliste, isolée sur fond blanc, sans texte ni décor. Rien qui détourne le regard. Juste la chose, et son nom, dit par vous.", "margin:0;font-size:16px;line-height:1.7;color:#444;display:block", "p")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:28px 24px 0">${imgBox(c, "g1", "", "height:320px;border-radius:20px")}${imgBox(c, "g2", "", "height:320px;border-radius:20px")}</div>
<div style="padding:28px 48px 0">${T(c, "p3", "Chaque illustration réaliste est faite en studio, avec de vrais objets : la cuillère de la cuisine, le savon de la salle de bain, la chaise haute. On les choisit ordinaires, pour qu'ils ressemblent à ceux de chez vous.", "margin:0 0 18px;font-size:16px;line-height:1.7;color:#444;display:block", "p")}<div style="background:${GREEN};border-radius:20px;padding:24px 28px">${T(c, "quote", "« Il a posé sa main sur la cuillère de la page, puis a cherché la vraie sur la table. »", "font-size:18px;font-weight:800;letter-spacing:-.01em;line-height:1.3;display:block;margin-bottom:6px")}${T(c, "quoteBy", "Une maman, à la crèche des Petits Pas", `font-size:12px;font-weight:600;color:${GREEN_INK}`)}</div></div>
<div style="padding:32px 40px 0;text-align:center">${btn(c, "cta", "Lire notre histoire", c.base)} ${btn(c, "cta2", "Voir les imagiers", c.base, false)}</div>
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
 */
function tplPartenaireBienvenue(c: RenderCtx): string {
  const href = c.values.__activation || "#";
  return card(`${topbarPlain(c, "topnote", "Invitation personnelle")}${logo(c)}
<div style="padding:32px 40px 0;text-align:center">${eyebrow(c, "eyebrow", "Bienvenue", PINK_INK)}${T(c, "title", "Votre espace partenaire est prêt", "margin:12px 0;font-size:34px;line-height:1.06;font-weight:800;letter-spacing:-.02em;display:block", "h1")}${T(c, "intro", "Vous y retrouverez votre code, votre lien de suivi et les commandes qui vous sont attribuées, mises à jour chaque heure.", "margin:0 auto;font-size:15px;line-height:1.6;color:#555;max-width:440px;display:block", "p")}</div>
<div style="padding:28px 40px 0;text-align:center"><a href="${esc(href)}" style="display:inline-block;background:${INK};color:#fff;padding:16px 28px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none">${T(c, "cta", "Accéder à mon compte", "")}</a></div>
<div style="padding:20px 40px 0;text-align:center">${T(c, "note", "Au premier accès, vous choisirez votre mot de passe. Ce lien est personnel et valable deux semaines.", `margin:0;font-size:13px;line-height:1.6;color:${SUBTLE};display:block`, "p")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:28px 24px 0">
<div style="background:${GREEN};border-radius:20px;padding:22px">${T(c, "s1t", "Votre code", "font-size:18px;font-weight:800;display:block;margin-bottom:6px")}${T(c, "s1d", "Une remise pour votre communauté, appliquée automatiquement.", `font-size:12px;font-weight:600;line-height:1.45;color:${GREEN_INK}`)}</div>
<div style="background:${BLUE};border-radius:20px;padding:22px">${T(c, "s2t", "Votre lien", "font-size:18px;font-weight:800;display:block;margin-bottom:6px")}${T(c, "s2d", "À coller en bio ou en story : les commandes vous sont attribuées 30 jours.", `font-size:12px;font-weight:600;line-height:1.45;color:${BLUE_INK}`)}</div>
</div>
<div style="padding:28px 40px 0;text-align:center">${T(c, "outro", "Une question ? Répondez simplement à cet e-mail, une vraie personne vous lira.", "margin:0;font-size:14px;line-height:1.6;color:#555;display:block", "p")}</div>
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

/** Enveloppe l'e-mail complet (doctype + fond + centrage 600 px). */
export function wrapEmail(id: string, ctx: RenderCtx, preheader: string): string {
  const body = renderTemplateBody(id, ctx);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(ctx.brand.shopName)}</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS}"><tr><td align="center" style="padding:28px 12px">
<div style="width:600px;max-width:100%;text-align:left">${body}</div>
</td></tr></table></body></html>`;
}

/** Version texte brut (repli sans images) à partir du rendu e-mail. */
export function toPlainText(html: string, unsub: string): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${text}\n\nSe désinscrire : ${unsub}`;
}
