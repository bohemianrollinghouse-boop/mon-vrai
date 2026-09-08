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

import { DEFAULT_PARCEL, DEFAULT_SHIPPING_RATES, EMPTY_SENDER } from "@/lib/domain/types";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { adminAuth } from "@/lib/firebase/admin";
import { saveCatalogueContent, saveContactContent, saveHomeContent, saveStoryContent } from "@/lib/db/content";
import { uploadMedia } from "@/lib/db/media";
import { saveFooterMenu, saveHeaderMenu } from "@/lib/db/menus";
import { upsertPolicy } from "@/lib/db/policies";
import { upsertProduct } from "@/lib/db/products";
import { saveSettings } from "@/lib/db/settings";
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

  /* ---------- Politiques ---------- */
  for (const [i, p] of policies.entries()) {
    await upsertPolicy({ handle: p.handle, title: p.title, body: { json: null, html: p.html }, position: i });
  }
  log(`politiques : ${policies.length}`);

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
      countries: ["FR", "BE", "LU"],
      rates: DEFAULT_SHIPPING_RATES,
      parcel: DEFAULT_PARCEL,
      sender: { ...EMPTY_SENDER, company: "Mon Vrai", street: "78 avenue des Champs-Élysées, Bureau 326", postalCode: "75008", city: "Paris", country: "FR", email: "contact@monvrai.fr" },
    },
    inventory: { lowThreshold: 20 },
    payments: { mode: "live" },
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
      description: "Des imagiers réalistes pour les 6–18 mois : une vraie photo par double-page, sur fond blanc.",
    },
  });

  /* ---------- Menus ---------- */
  await saveHeaderMenu([
    item("accueil", "Accueil", { kind: "system", key: "home" }),
    item("catalogue", "Catalogue", { kind: "system", key: "catalogue" }),
    item("histoire", "Notre histoire", { kind: "system", key: "story" }),
    item("contact", "Contact", { kind: "system", key: "contact" }),
  ]);
  await saveFooterMenu([
    {
      id: "boutique",
      heading: "Boutique",
      items: [
        item("f-accueil", "Accueil", { kind: "system", key: "home" }),
        item("f-catalogue", "Catalogue", { kind: "system", key: "catalogue" }),
        item("f-contact", "Contact", { kind: "system", key: "contact" }),
      ],
    },
    {
      id: "informations",
      heading: "Informations",
      items: policies.map((p) => item(`f-${p.handle}`, p.title, { kind: "policy", handle: p.handle })),
    },
  ]);
  log("réglages et menus");

  /* ---------- Contenus des pages système ---------- */
  await saveHomeContent({
    hero: {
      badge: "Imagiers 6–18 mois",
      heading: "Le monde, en vrai, dans de petites mains.",
      text: "Des photos nettes sur fond blanc, une par double-page. Pour apprendre à nommer, sans se distraire.",
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
      heading: "Grandir avec du vrai.",
      text: "Née d'une passion pour l'éveil des tout-petits, Mon Vrai est une petite maison d'édition française qui fait un pari simple : montrer aux enfants le monde tel qu'il est.",
      image: ambiance[0],
      tint: "pink",
    },
    intro: {
      heading: "Tout a commencé par un constat.",
      paragraphs: [
        "Entre 6 et 18 mois, un enfant apprend à nommer le monde. Il pointe, il regarde, il cherche vos yeux. Pourtant, la plupart des imagiers qu'on lui propose sont pleins de dessins, de couleurs, de décors — et bien souvent, de texte qu'il ne lira pas avant des années.",
        "Nous voulions un livre qui ne fasse qu'une chose : montrer une vraie vache, une vraie pomme, une vraie cuillère. Nettes, seules, sur fond blanc. Pour que l'enfant fasse le lien, sans détour, entre la page et sa vie.",
        "Simple, réaliste & essentiel. C'est devenu notre ligne.",
      ],
    },
    principles: [
      { eyebrow: "01 · Réaliste", title: "De vraies photos, jamais de dessins", text: "Ce que l'enfant voit dans le livre, il le retrouve dans la rue, la cuisine ou le jardin.", tint: "green" },
      { eyebrow: "02 · Simple", title: "Un objet par double-page", text: "Sans texte ni décor, pour favoriser l'attention et laisser l'enfant explorer à son rythme.", tint: "blue" },
      { eyebrow: "03 · Essentiel", title: "Fait pour durer", text: "Cartonné, coins arrondis, papier FSC, encre de soja. Conforme EN 71.", tint: "sand" },
    ],
    gallery: [ambiance[1], ambiance[2], ambiance[3]].filter((x): x is ImageRef => Boolean(x)),
    walk: {
      heading: "Une promenade main dans la main.",
      paragraphs: [
        "Chaque livre est un dialogue complice entre enfant et parent, où la curiosité s'invite sans bruit. Installez-vous. Nommez ce qu'il regarde, sans lui demander de répéter. Observez sa réaction. Laissez-le tourner les pages.",
        "Nos imagiers sont aussi pensés pour les assistantes maternelles, les crèches et tous les professionnels de la petite enfance qui accompagnent les tout-petits au quotidien.",
        "Aujourd'hui, l'univers Mon Vrai se concentre sur les 6–18 mois, avec neuf titres. D'autres âges et d'autres thèmes viendront enrichir la collection au fil du temps.",
      ],
    },
    cta: {
      heading: "Découvrez les neuf imagiers",
      text: "10 € le titre, précommande ouverte. Expédition dès le 25 décembre.",
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
