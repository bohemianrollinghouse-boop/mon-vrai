/*
 * Peuple les émulateurs Firebase avec le contenu réel de la boutique Shopify, exporté
 * dans content/shopify-export/. Idempotent : relancer écrase les documents avec les
 * mêmes valeurs, sans doublons.
 *
 *   pnpm emulators   (dans un terminal)
 *   pnpm seed        (dans un autre)
 *
 * Refuse de tourner hors émulateurs : on ne réinitialise pas une production par
 * mégarde. `--force` lève cette protection, en connaissance de cause.
 */

import { DEFAULT_COSTS, DEFAULT_PARCEL, DEFAULT_SHIPPING_RATES, EMPTY_SENDER } from "@/lib/domain/types";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { adminAuth } from "@/lib/firebase/admin";
import { getCatalogueContent, getContactContent, getHomeContent, saveCatalogueContent, saveContactContent, saveHomeContent, saveStoryContent } from "@/lib/db/content";
import { uploadMedia } from "@/lib/db/media";
import { saveFooterMenu, saveHeaderMenu } from "@/lib/db/menus";
import { savePageBlocks, setHomePage, upsertPage } from "@/lib/db/pages";
import { upsertProduct } from "@/lib/db/products";
import { saveSettings } from "@/lib/db/settings";
import { legalToDocument } from "@/lib/blocks/from-html";
import { catalogueToBlocks, contactToBlocks, homeToBlocks, proToBlocks } from "@/lib/blocks/from-content";
import { EDITORIAL_PHOTOS, conceptBlocks, storyBlocks } from "@/lib/blocks/editorial-pages";
import { extractItems, slugify, splitLegacyTitle } from "@/lib/domain/slug";
import type { Badge, ImageRef, MenuItem, Tint } from "@/lib/domain/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXPORT = path.join(ROOT, "content/shopify-export");
const CDN = "https://mon-vrai-2.myshopify.com/cdn/shop/files/";

type RawProduct = {
  handle: string;
  title: string;
  body_html: string | null;
  variants: { price: string; sku: string | null }[];
  images: { src: string; width?: number; height?: number; alt?: string | null }[];
};
type RawImage = { handle: string; n: number; file: string; width?: number; height?: number; alt?: string | null };
type RawPolicy = { handle: string; title: string; html: string };

/* Ce que Shopify ne stockait pas et que la maquette fixe : ordre, pastilles, teintes. */
const CATALOGUE_ORDER = [
  "le-visage",
  "les-animaux-de-compagnie",
  "les-animaux-de-la-ferme",
  "les-animaux-de-la-foret",
  "les-fruits",
  "les-legumes",
  "les-objets-du-quotidien",
  "les-vehicules",
  "les-vetements",
];
const BADGES: Record<string, Badge> = {
  "le-visage": "new",
  "les-animaux-de-la-ferme": "new",
  "les-animaux-de-la-foret": "new",
  "les-vehicules": "new",
  "les-animaux-de-compagnie": "reissue",
  "les-objets-du-quotidien": "reissue",
};
const TINTS: Record<string, Tint> = {
  "le-visage": "pink",
  "les-animaux-de-compagnie": "green",
  "les-animaux-de-la-ferme": "green",
  "les-animaux-de-la-foret": "green",
  "les-fruits": "sand",
  "les-legumes": "sand",
  "les-objets-du-quotidien": "blue",
  "les-vehicules": "blue",
  "les-vetements": "pink",
};
const SHIP_FROM = "2026-12-25";

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes("--force")) {
    throw new Error("Aucun émulateur détecté (FIRESTORE_EMULATOR_HOST). Ajoute --force pour viser une vraie base.");
  }

  const products = JSON.parse(await readFile(path.join(EXPORT, "products.raw.json"), "utf-8")).products as RawProduct[];
  const images = JSON.parse(await readFile(path.join(EXPORT, "images.json"), "utf-8")) as RawImage[];
  const policies = JSON.parse(await readFile(path.join(EXPORT, "policies.json"), "utf-8")) as RawPolicy[];

  /* ---------- Médias : photos produits ---------- */
  const imagesByHandle = new Map<string, ImageRef[]>();
  for (const img of images.sort((a, b) => a.n - b.n)) {
    const bytes = await readFile(path.join(EXPORT, "images", img.file));
    const media = await uploadMedia({
      bytes,
      mime: mimeFor(img.file),
      filename: img.file,
      alt: img.alt ?? "",
      width: img.width,
      height: img.height,
    });
    const list = imagesByHandle.get(img.handle) ?? [];
    list.push({ url: media.url, alt: media.alt, width: media.width, height: media.height });
    imagesByHandle.set(img.handle, list);
  }
  log(`médias produits : ${images.length}`);

  /* ---------- Médias : photos d'ambiance de la maquette ---------- */
  const ambiance = await uploadAmbiance([
    "IMG_7365.jpg?v=1785703941",
    "IMG_20260129_101830.jpg?v=1785704129",
    "IMG_7450.jpg?v=1785704349",
    "IMG_20260106_184225.jpg?v=1788650205",
  ]);

  /* ---------- Médias : photos des pages éditoriales ---------- */
  const pic = await uploadEditorial(EDITORIAL_PHOTOS, ambiance);

  /* ---------- Vidéo d'accueil : rapatriée du CDN Shopify, servie par Storage ---------- */
  const heroVideo = await uploadMedia({
    bytes: await readFile(path.join(EXPORT, "media/hero.mp4")),
    mime: "video/mp4",
    filename: "hero.mp4",
  });
  const heroPoster = await uploadMedia({
    bytes: await readFile(path.join(EXPORT, "media/hero-poster.jpg")),
    mime: "image/jpeg",
    filename: "hero-poster.jpg",
  });
  log("vidéo d'accueil");

  /* ---------- Produits ---------- */
  for (const raw of products) {
    const { ageLabel, name } = splitLegacyTitle(raw.title);
    const slug = slugify(name);
    const body = raw.body_html ?? "";
    await upsertProduct({
      slug,
      title: name,
      ageLabel: ageLabel || "6–18 mois",
      subtitle: subtitleFrom(body),
      descriptionHtml: stripLeadingHeading(body),
      items: extractItems(body),
      price: Math.round(Number(raw.variants[0]?.price ?? "10") * 100),
      weightG: 100,
      images: imagesByHandle.get(raw.handle) ?? [],
      badge: BADGES[slug] ?? "none",
      tint: TINTS[slug] ?? "green",
      preorder: { enabled: true, shipFrom: SHIP_FROM },
      stock: null,
      isbn: raw.variants[0]?.sku || undefined,
      position: Math.max(0, CATALOGUE_ORDER.indexOf(slug)),
      status: "published",
      seo: {},
    });
  }
  log(`produits : ${products.length}`);

  /* ---------- Pages légales ---------- */
  /* Elles n'ont plus de collection à part : ce sont des pages libres, en blocs. Le
     HTML de l'export est découpé aux titres ; il reste en `body` comme filet. */
  for (const p of policies) {
    await upsertPage({ slug: p.handle, title: p.title, status: "published", category: "Pages légales", body: { json: null, html: p.html } });
    await savePageBlocks(p.handle, legalToDocument(p.html, p.title));
  }
  log(`pages légales : ${policies.length}`);

  /* ---------- Réglages ---------- */
  await saveSettings({
    shopName: "Mon Vrai",
    tagline: "Des imagiers réalistes pour les 6–18 mois. Livraison France, Belgique, Luxembourg.",
    announcement: {
      enabled: true,
      text: "Précommandes ouvertes · expédition dès le 25 décembre · livraison offerte dès 30 €",
    },
    contact: { email: "contact@monvrai.fr", addressLines: ["19, Les Guindreaux", "France"] },
    socials: {},
    shipping: {
      freeThreshold: 3000,
      preorderShipFrom: SHIP_FROM,
      boxtalMode: "live",
      countries: ["FR", "BE", "LU"],
      rates: DEFAULT_SHIPPING_RATES,
      parcel: DEFAULT_PARCEL,
      sender: { ...EMPTY_SENDER, company: "Mon Vrai", street: "78 avenue des Champs-Élysées, Bureau 326", postalCode: "75008", city: "Paris", country: "FR", email: "contact@monvrai.fr" },
    },
    inventory: { lowThreshold: 20 },
    // Coûts (URSSAF, fabrication, emballage, commission) : à renseigner dans /admin/revenus.
    costs: DEFAULT_COSTS,
    payments: { mode: "live", paypal: false },
    promos: { collectionOffer: { enabled: true } },
    legal: {
      footerLine: "",
      sellerName: "",
      sellerAddressLines: ["78 avenue des Champs-Élysées, Bureau 326", "75008 Paris", "France"],
      siret: "898 998 216 00078",
      vatNumber: "",
      vatNote: "TVA non applicable, art. 293 B du CGI",
    },
    seo: {
      title: "Mon Vrai — imagiers réalistes 6–18 mois",
      description: "Des imagiers réalistes pour les 6–18 mois : une illustration réaliste par double-page, sur fond blanc.",
    },
  });

  /* ---------- Menus ---------- */
  await saveHeaderMenu([
    item("accueil", "Accueil", { kind: "system", key: "home" }),
    item("catalogue", "Catalogue", { kind: "page", slug: "catalogue" }),
    item("histoire", "Notre histoire", { kind: "page", slug: "notre-histoire" }),
    item("concept", "Le concept", { kind: "page", slug: "le-concept" }),
    item("contact", "Contact", { kind: "page", slug: "contact" }),
    item("pro", "Vous êtes pro ?", { kind: "page", slug: "pro" }),
  ]);
  await saveFooterMenu([
    {
      id: "boutique",
      heading: "Boutique",
      items: [
        item("f-accueil", "Accueil", { kind: "system", key: "home" }),
        item("f-catalogue", "Catalogue", { kind: "page", slug: "catalogue" }),
        item("f-contact", "Contact", { kind: "page", slug: "contact" }),
        item("f-pro", "Vous êtes pro ?", { kind: "page", slug: "pro" }),
      ],
    },
    {
      id: "informations",
      heading: "Informations",
      items: [
        item("f-histoire", "Notre histoire", { kind: "page", slug: "notre-histoire" }),
        item("f-concept", "Le concept", { kind: "page", slug: "le-concept" }),
        ...policies.map((p) => item(`f-${p.handle}`, p.title, { kind: "page", slug: p.handle })),
      ],
    },
  ]);
  log("réglages et menus");

  /* ---------- Contenus des pages système ---------- */
  await saveHomeContent({
    hero: {
      badge: "Imagiers 6–18 mois",
      heading: "Le monde, en vrai, dans de petites mains.",
      text: "Des illustrations réalistes nettes sur fond blanc, une par double-page. Pour apprendre à nommer, sans se distraire.",
      videoUrl: heroVideo.url,
      posterUrl: heroPoster.url,
      primary: { label: "Acheter maintenant", href: "/catalogue" },
      secondary: { label: "Comment l'utiliser ?", href: "/notre-histoire" },
    },
    tiles: [
      { title: "Une image par page", text: "Réaliste, isolée sur fond blanc, sans texte ni décor", tint: "green" },
      { title: "14 × 14 cm", text: "Cartonné, coins arrondis, finition mate", tint: "blue" },
      { title: "10 €", text: "Papier FSC, encre de soja, conforme EN 71", tint: "pink" },
    ],
    catalogue: { heading: "Mon vrai imagier", linkLabel: "Voir le catalogue →", count: 4 },
    howTo: {
      eyebrow: "Comment l'utiliser",
      heading: "Installez-vous. Nommez. Laissez explorer.",
      text: "Nommez simplement ce que votre enfant regarde, sans lui demander de répéter. Observez sa réaction, laissez-le tourner les pages. Un livre pour découvrir, échanger, créer du lien.",
      image: ambiance[0],
      cta: { label: "Questions fréquentes", href: "/contact#faq" },
      tint: "green",
    },
    story: {
      eyebrow: "Notre histoire",
      heading: "Une promenade main dans la main",
      text: "Née d'une passion pour l'éveil des tout-petits, notre maison imagine des livres qui célèbrent la douceur du quotidien. Chaque page est un dialogue complice entre enfant et parent, où la curiosité s'invite sans bruit.",
      image: ambiance[1],
      cta: { label: "Lire notre histoire", href: "/notre-histoire" },
    },
    newsletter: {
      heading: "Restez curieux",
      text: "Nouveaux titres, coulisses de fabrication et idées de lecture — une fois par mois, pas plus.",
      placeholder: "Votre e-mail",
      button: "S'inscrire",
    },
  });

  await saveCatalogueContent({
    hero: {
      eyebrow: "Collection 6–18 mois · [count] titres",
      heading: "Mon vrai imagier",
      text: "Neuf thèmes du quotidien. Six vraies images par livre, une par double-page, sur fond blanc. 10 € chacun — ou la collection complète à 80 €.",
      tint: "green",
    },
    offer: {
      enabled: true,
      title: "La collection complète",
      compareAt: "90 €",
      price: "80 €",
      note: "Les 9 imagiers, expédiés ensemble. Un livre offert.",
      cta: { label: "Précommander la collection", href: "/catalogue" },
    },
    specs: [
      { title: "14 × 14 cm", text: "Cartonné, coins arrondis, finition mate. Fait pour les petites mains." },
      { title: "Papier FSC · encre de soja", text: "Conforme aux exigences EN 71. Imprimé de façon responsable." },
      { title: "Expédition groupée", text: "Plusieurs livres, un seul colis. France, Belgique, Luxembourg." },
    ],
  });

  await saveStoryContent({
    hero: {
      eyebrow: "Notre histoire",
      heading: "Mon Vrai est né pour nos enfants. Il grandit aujourd'hui pour les vôtres.",
      text: "Mon Vrai est né d'un besoin très simple : proposer aux tout-petits des supports réellement pensés pour eux, ancrés dans le réel, simples à observer et adaptés à leur développement. Tout a commencé par une maman qui fabriquait, pour sa fille, les livres qu'elle ne trouvait nulle part ailleurs.",
      image: ambiance[0],
      tint: "pink",
    },
    intro: {
      heading: "Avant la marque, une maman qui cherchait le bon livre",
      paragraphs: [
        "Je suis devenue maman très jeune, dès 19 ans, et cette grossesse a fait naître chez moi une vraie passion pour le développement de l'enfant. Je me suis formée à la pédagogie Montessori, à d'autres pédagogies alternatives et à la neuroéducation, pour comprendre comment un bébé découvre son environnement et de quoi il a besoin à chaque étape.",
        "Pourtant, je trouvais difficilement les imagiers que je cherchais pour ma fille : trop de pages, trop de texte, des dessins trop éloignés du réel. Je voulais des supports courts, simples, lisibles, avec peu d'informations à la fois et des représentations proches du monde réel — un peu comme Noir sur blanc et Blanc sur noir de Tana Hoban, qui m'ont beaucoup inspirée.",
        "Alors, quand je ne trouvais pas ce que je cherchais, je le fabriquais moi-même : je photographiais des éléments du quotidien, je les imprimais en petites cartes, je les plastifiais. Il n'y avait ni marque, ni projet éditorial. Juste une maman qui fabriquait les supports qu'elle cherchait pour son enfant.",
        "À l'arrivée de ma deuxième fille, avec des outils comme Canva devenus plus accessibles, j'ai commencé à imaginer de vrais petits livres. J'ai choisi des représentations réalistes, un fond blanc, très peu d'éléments, aucun texte : une seule image à observer à la fois, pour retirer plutôt qu'ajouter.",
        "J'ai limité chaque livre à six représentations. Les cinq premiers imagiers sont nés ainsi : Les Fruits, Les Légumes, Les Animaux de compagnie, Les Vêtements et Les Objets du quotidien — créés d'abord pour ma fille, avant de plaire à d'autres parents autour de moi.",
      ],
    },
    principles: [
      { eyebrow: "Réaliste", title: "Des représentations qui ressemblent au monde réel", text: "Un fruit qui ressemble à un vrai fruit, un animal qui ressemble réellement à l'animal dont on lui parle : l'enfant retrouve dans le livre ce qu'il observe déjà dans son quotidien.", tint: "green" },
      { eyebrow: "Épuré", title: "Une image, pas une page chargée", text: "Six représentations par livre, un seul élément par double page, un fond blanc, aucun décor et aucun texte — pour laisser toute la place à l'observation.", tint: "blue" },
      { eyebrow: "Pensé pour durer", title: "Un vrai objet du quotidien", text: "Livres cartonnés au format 14 × 14 cm, coins arrondis, pensés pour être manipulés, regardés et repris par l'enfant, encore et encore.", tint: "sand" },
    ],
    gallery: [ambiance[1], ambiance[2], ambiance[3]].filter((x): x is ImageRef => Boolean(x)),
    walk: {
      heading: "D'une maman qui fabriquait des cartes à une marque",
      paragraphs: [
        "Pour faire fabriquer ces premiers imagiers, j'ai dû apprendre un métier que je ne connaissais pas : chercher des fournisseurs, comprendre la fabrication, me renseigner sur les normes. J'ai créé ma structure éditoriale, Bohemian Rolling House, et je suis devenue éditrice presque malgré moi.",
        "En 2025, une campagne Ulule a permis de financer une première production de 500 exemplaires. Ils se sont vendus en quatre mois environ — d'abord auprès de ma communauté, puis auprès de parents et de professionnels de la petite enfance qui ne me suivaient pas. C'est là que j'ai compris que ce besoin dépassait ma propre famille.",
        "Le projet s'est pourtant arrêté un temps. J'étais seule dans un univers tout nouveau pour moi, avec beaucoup de questions — identité, gamme, site, production — et des changements importants dans ma vie personnelle. Mais l'idée n'a jamais vraiment disparu.",
        "J'ai compris qu'il fallait aller plus loin que les premiers livres faits seule. J'ai travaillé avec une graphiste pour construire une véritable identité : un logo, une palette, une direction graphique capable de réunir tous les futurs produits. Mes Vrais Imagiers est devenu Mon Vrai, pour pouvoir grandir au-delà des imagiers.",
        "Les nouveaux thèmes ne sont pas nés seulement de mes goûts : une enquête menée auprès de 128 parents, assistantes maternelles et professionnels de la petite enfance a confirmé nos valeurs — réalisme, simplicité, solidité, adaptation à l'âge — et guidé les prochaines collections.",
        "Mon ambition dépasse aujourd'hui les imagiers 6–18 mois : des collections 18–36 mois, des cartes contrastées, des supports de langage, des outils autour des émotions. Toujours la même question au centre : de quoi l'enfant a-t-il besoin à ce moment de son développement ?",
      ],
    },
    cta: {
      heading: "Mon Vrai est né pour mes enfants",
      text: "Il grandit aujourd'hui pour les vôtres. Découvrez les imagiers pensés pour accompagner les tout-petits dans leur découverte du monde réel.",
      button: { label: "Voir le catalogue", href: "/catalogue" },
    },
  });

  await saveContactContent({
    intro: {
      eyebrow: "Contact",
      heading: "On vous répond, en vrai.",
      text: "Une question sur une précommande, un livre abîmé, une commande pour votre crèche ? Écrivez-nous — nous répondons sous 48 h ouvrées.",
    },
    proLabel: "Professionnels & revendeurs",
    proText: "Crèches, librairies, assistantes maternelles : précisez-le dans votre message, nous avons des conditions dédiées.",
    subjects: ["Ma précommande", "Livraison", "Livre abîmé / retour", "Crèche / professionnel", "Autre"],
    legal: "En envoyant ce formulaire, vous acceptez notre politique de confidentialité.",
    successText: "Merci ! Votre message est parti, nous répondons sous 48 h ouvrées.",
    faq: {
      heading: "Avant d'écrire, la réponse est peut-être ici",
      note: "Questions fréquentes",
      items: [
        { q: "Quand ma précommande sera-t-elle expédiée ?", a: "Les premières expéditions sont prévues à partir du 25 décembre 2026, sous réserve de la réception du stock.", cat: "Précommande", hidden: false },
        { q: "Si je commande plusieurs livres, seront-ils envoyés ensemble ?", a: "Oui. Les imagiers d'une même commande sont regroupés et expédiés dans un seul colis.", cat: "Livraison", hidden: false },
        { q: "Où livrez-vous ?", a: "En France, en Belgique et au Luxembourg — Mondial Relay, Colissimo ou Chronopost selon la destination.", cat: "Livraison", hidden: false },
        { q: "Puis-je retourner ma commande ?", a: "Vous disposez de 14 jours à compter de la réception pour exercer votre droit de rétractation.", cat: "Retours", hidden: false },
        { q: "Que faire si mon livre arrive abîmé ?", a: "Envoyez-nous des photos du livre et de son emballage dès réception ; nous vous proposons une solution adaptée.", cat: "Retours", hidden: false },
        { q: "Est-il adapté aux professionnels de la petite enfance ?", a: "Oui — à la maison comme en crèche ou chez une assistante maternelle.", cat: "Les livres", hidden: false },
      ],
    },
  });
  log("contenus accueil, notre histoire, contact");

  /* ---------- Pages composées ---------- */
  /* L'accueil et « Notre histoire » ne sont plus des routes système : ce sont des
     pages en blocs, dérivées des contenus ci-dessus. `content/home` et
     `content/story` restent en base — l'accueil y retombe si aucune page n'est
     désignée, et leur éditeur existe encore dans /admin/contenus. */
  const home = await getHomeContent();
  const catalogue = await getCatalogueContent();
  const contact = await getContactContent();

  /* « Notre histoire » et « Le concept » sont rédigées, pas converties : leur contenu
     vient de lib/blocks/editorial-pages.ts. */
  await upsertPage({ category: "Vitrine", slug: "notre-histoire", title: "Notre histoire", status: "published", body: { json: null, html: "" } });
  await savePageBlocks("notre-histoire", storyBlocks(pic, home?.newsletter));
  await upsertPage({ category: "Vitrine", slug: "le-concept", title: "Le concept", status: "published", body: { json: null, html: "" } });
  await savePageBlocks("le-concept", conceptBlocks(pic));

  if (home) {
    await upsertPage({ category: "Vitrine", slug: "accueil", title: "Accueil", status: "published", body: { json: null, html: "" } });
    await savePageBlocks("accueil", homeToBlocks(home));
    await setHomePage("accueil");
  }
  if (catalogue) {
    await upsertPage({ category: "Vitrine", slug: "catalogue", title: "Catalogue", status: "published", body: { json: null, html: "" } });
    await savePageBlocks("catalogue", catalogueToBlocks(catalogue, home?.newsletter));
  }
  if (contact) {
    await upsertPage({ category: "Vitrine", slug: "contact", title: "Contact", status: "published", body: { json: null, html: "" } });
    await savePageBlocks("contact", contactToBlocks(contact, home?.newsletter));
  }
  await upsertPage({ category: "Vitrine", slug: "pro", title: "Espace professionnels", status: "published", body: { json: null, html: "" } });
  await savePageBlocks("pro", proToBlocks());
  log("pages composées : accueil, notre histoire, le concept, catalogue, contact, pro");

  /* ---------- Compte administrateur (émulateur uniquement) ---------- */
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (email && password && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const auth = adminAuth();
    const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, password, displayName: "Admin" }));
    await auth.setCustomUserClaims(user.uid, { admin: true });
    log(`admin : ${email}`);
  }

  log("terminé");
}

/* ---------- utilitaires ---------- */

function item(id: string, label: string, target: MenuItem["target"]): MenuItem {
  return { id, label, target };
}

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
}

/**
 * La description Shopify commençait par un <h2> reprenant le titre, puis par les
 * mentions « Nouveauté » / « Nouvelle édition » et « Collection mon vrai imagier … »
 * en gras. Tout cela est désormais porté par des champs structurés (titre, pastille,
 * surtitre) : on ne garde que le corps.
 */
function stripLeadingHeading(html: string): string {
  let out = html.replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>\s*/i, "");
  const boilerplate = /^\s*<p[^>]*>\s*<strong>\s*(Nouveaut\u00e9|Nouvelle \u00e9dition|Collection mon vrai imagier[^<]*)\s*<\/strong>\s*<\/p>\s*/i;
  // Variante : « <strong>Mon vrai imagier - Les fruits</strong> <em>Collection …</em> » en un seul paragraphe.
  const titleLine = /^\s*<p[^>]*>\s*<strong>\s*Mon vrai imagier[^<]*<\/strong>\s*(<em>[^<]*<\/em>)?\s*<\/p>\s*/i;
  while (boilerplate.test(out) || titleLine.test(out)) out = out.replace(boilerplate, "").replace(titleLine, "");
  return out.trim();
}

/** « Un imagier réaliste pour découvrir les fruits du quotidien » — la phrase avant le « : ». */
function subtitleFrom(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = text.match(/(Un imagier réaliste[^:]*?)\s*:/i);
  return m ? m[1].trim() : "";
}

/**
 * Photos des pages éditoriales : lues dans content/editorial/ et envoyées dans la
 * médiathèque. Celles qui manquent reprennent une photo d'ambiance, pour que la page
 * ait quand même une allure — la bonne photo se choisit ensuite dans l'éditeur.
 */
async function uploadEditorial(names: string[], fallback: ImageRef[]): Promise<(name: string) => ImageRef | undefined> {
  const dir = path.join(ROOT, "content/editorial");
  const found = new Map<string, ImageRef>();
  for (const name of names) {
    const local = path.join(dir, name);
    if (!(await exists(local))) continue;
    const media = await uploadMedia({ bytes: await readFile(local), mime: mimeFor(name), filename: name });
    found.set(name, { url: media.url, alt: "", width: media.width, height: media.height });
  }
  log(`photos éditoriales : ${found.size} sur ${names.length} (les autres reprennent une photo d'ambiance)`);
  return (name) => found.get(name) ?? fallback[Math.max(0, names.indexOf(name)) % fallback.length];
}

/**
 * Photos d'ambiance de la maquette : téléchargées une fois dans content/shopify-export/media/
 * (le CDN Shopify disparaîtra avec la boutique), puis envoyées dans Storage.
 */
async function uploadAmbiance(files: string[]): Promise<ImageRef[]> {
  const dir = path.join(EXPORT, "media");
  await mkdir(dir, { recursive: true });
  const out: ImageRef[] = [];
  for (const f of files) {
    const name = f.split("?")[0];
    const local = path.join(dir, name);
    if (!(await exists(local))) {
      const res = await fetch(`${CDN}${f}&width=1800`);
      if (!res.ok) throw new Error(`Téléchargement impossible : ${f} (${res.status})`);
      await writeFile(local, Buffer.from(await res.arrayBuffer()));
    }
    const media = await uploadMedia({ bytes: await readFile(local), mime: mimeFor(name), filename: name });
    out.push({ url: media.url, alt: "" });
  }
  log(`médias d'ambiance : ${out.length}`);
  return out;
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

main().catch((err) => {
  console.error("[seed] échec :", err);
  process.exit(1);
});
