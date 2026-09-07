import { z } from "zod";

/*
 * Schémas des documents Firestore. Une seule définition sert à valider ce qui
 * entre (formulaires admin, webhooks) et à typer ce qui sort. Les montants sont
 * des entiers en centimes : jamais de flottant sur de l'argent.
 */

export const Slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug : minuscules, chiffres et tirets");

export const Cents = z.number().int().nonnegative();

export const Status = z.enum(["draft", "published"]);
export type Status = z.infer<typeof Status>;

export const Seo = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(200).optional(),
});
export type Seo = z.infer<typeof Seo>;

/* ---------- Médias ---------- */

export const Media = z.object({
  id: z.string(),
  path: z.string(),
  url: z.url(),
  alt: z.string().default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mime: z.string(),
  createdAt: z.number(),
});
export type Media = z.infer<typeof Media>;

export const ImageRef = z.object({
  url: z.url(),
  alt: z.string().default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ImageRef = z.infer<typeof ImageRef>;

/* ---------- Produits ---------- */

/** Pastille éditoriale : nouveauté, réédition, ou rien. Reprend les deux cases Shopify. */
export const Badge = z.enum(["none", "new", "reissue"]);
export type Badge = z.infer<typeof Badge>;

/** Teinte de la vignette, parmi la palette de la maquette. */
export const Tint = z.enum(["green", "blue", "pink", "sand"]);
export type Tint = z.infer<typeof Tint>;

export const Product = z.object({
  slug: Slug,
  title: z.string().min(1).max(120),
  /** Surtitre, ex. « 6–18 mois ». */
  ageLabel: z.string().max(40).default("6–18 mois"),
  /** Phrase d'accroche courte sous le titre. */
  subtitle: z.string().max(200).default(""),
  /** Description longue, HTML issu du WYSIWYG. */
  descriptionHtml: z.string().default(""),
  /** Les six objets du livre, ex. « la pomme, la clémentine, … ». */
  items: z.array(z.string().min(1)).max(12).default([]),
  price: Cents,
  compareAtPrice: Cents.optional(),
  images: z.array(ImageRef).default([]),
  badge: Badge.default("none"),
  tint: Tint.default("green"),
  preorder: z
    .object({
      enabled: z.boolean().default(false),
      /** Date d'expédition annoncée, ISO (AAAA-MM-JJ). */
      shipFrom: z.string().optional(),
    })
    .default({ enabled: false }),
  /** Stock disponible ; null = non suivi (vente illimitée). */
  stock: z.number().int().nullable().default(null),
  isbn: z.string().max(20).optional(),
  /** Ordre d'affichage dans le catalogue. */
  position: z.number().int().default(0),
  status: Status.default("draft"),
  seo: Seo.default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Product = z.infer<typeof Product>;

/* ---------- Pages libres ---------- */

export const RichBody = z.object({
  /** Document Tiptap, source de vérité pour l'édition. */
  json: z.unknown(),
  /** Rendu HTML figé à la sauvegarde, servi au public. */
  html: z.string(),
});
export type RichBody = z.infer<typeof RichBody>;

export const Page = z.object({
  slug: Slug,
  title: z.string().min(1).max(120),
  body: RichBody,
  status: Status.default("draft"),
  seo: Seo.default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Page = z.infer<typeof Page>;

/* ---------- Menus ---------- */

export const SystemPageKey = z.enum([
  "home",
  "catalogue",
  "search",
  "cart",
  "account",
  "contact",
  "policies",
  "story",
]);
export type SystemPageKey = z.infer<typeof SystemPageKey>;

/** Une entrée de menu pointe vers une page système, une page libre ou une URL. */
export const MenuTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system"), key: SystemPageKey }),
  z.object({ kind: z.literal("page"), slug: Slug }),
  z.object({ kind: z.literal("policy"), handle: z.string().min(1) }),
  z.object({ kind: z.literal("url"), href: z.string().min(1), newTab: z.boolean().default(false) }),
]);
export type MenuTarget = z.infer<typeof MenuTarget>;

export const MenuItem = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(60),
  target: MenuTarget,
});
export type MenuItem = z.infer<typeof MenuItem>;

/** Menu d'en-tête : une liste plate. */
export const HeaderMenu = z.object({
  items: z.array(MenuItem).max(8),
  updatedAt: z.number(),
});
export type HeaderMenu = z.infer<typeof HeaderMenu>;

/** Menu de pied de page : des colonnes titrées. */
export const FooterColumn = z.object({
  id: z.string().min(1),
  heading: z.string().min(1).max(40),
  items: z.array(MenuItem).max(10),
});
export const FooterMenu = z.object({
  columns: z.array(FooterColumn).max(3),
  updatedAt: z.number(),
});
export type FooterColumn = z.infer<typeof FooterColumn>;
export type FooterMenu = z.infer<typeof FooterMenu>;

/* ---------- Réglages du site ---------- */

export const SiteSettings = z.object({
  shopName: z.string().min(1).default("Mon Vrai"),
  tagline: z.string().default(""),
  announcement: z
    .object({
      enabled: z.boolean().default(true),
      text: z.string().default(""),
    })
    .default({ enabled: true, text: "" }),
  contact: z
    .object({
      email: z.email().optional(),
      phone: z.string().optional(),
      addressLines: z.array(z.string()).default([]),
    })
    .default({ addressLines: [] }),
  socials: z
    .object({
      instagram: z.url().optional(),
      tiktok: z.url().optional(),
      facebook: z.url().optional(),
    })
    .default({}),
  shipping: z
    .object({
      /** Seuil de livraison offerte, en centimes ; 0 = jamais. */
      freeThreshold: Cents.default(3000),
      /** Date d'expédition par défaut des précommandes, ISO. */
      preorderShipFrom: z.string().optional(),
      countries: z.array(z.string()).default(["FR", "BE", "LU"]),
    })
    .default({ freeThreshold: 3000, countries: ["FR", "BE", "LU"] }),
  legal: z
    .object({
      footerLine: z.string().default(""),
      /** Mentions vendeur imprimées sur les factures. */
      sellerName: z.string().default(""),
      sellerAddressLines: z.array(z.string()).default([]),
      siret: z.string().default(""),
      vatNumber: z.string().default(""),
      /** Mention TVA quand aucune taxe n'est facturée (franchise en base, etc.). */
      vatNote: z.string().default("TVA non applicable, art. 293 B du CGI"),
    })
    .default({ footerLine: "", sellerName: "", sellerAddressLines: [], siret: "", vatNumber: "", vatNote: "TVA non applicable, art. 293 B du CGI" }),
  seo: Seo.default({}),
  updatedAt: z.number(),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

/* ---------- Politiques (pages légales) ---------- */

export const Policy = z.object({
  handle: Slug,
  title: z.string().min(1).max(120),
  body: RichBody,
  position: z.number().int().default(0),
  updatedAt: z.number(),
});
export type Policy = z.infer<typeof Policy>;

/* ---------- Panier ---------- */

export const CartLine = z.object({
  productSlug: Slug,
  qty: z.number().int().positive().max(50),
});
export const Cart = z.object({
  lines: z.array(CartLine).default([]),
  /** Code promo saisi, appliqué au moment du paiement par Stripe. */
  promoCode: z.string().max(40).optional(),
  updatedAt: z.number(),
});
export type CartLine = z.infer<typeof CartLine>;
export type Cart = z.infer<typeof Cart>;

/* ---------- Clients et commandes ---------- */

export const Address = z.object({
  name: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  phone: z.string().optional(),
});
export type Address = z.infer<typeof Address>;

export const Customer = z.object({
  uid: z.string(),
  email: z.email(),
  name: z.string().default(""),
  stripeCustomerId: z.string().optional(),
  addresses: z.array(Address).default([]),
  /** Consentement newsletter, avec horodatage pour la preuve RGPD. */
  newsletter: z.object({ optIn: z.boolean(), at: z.number() }).optional(),
  createdAt: z.number(),
});
export type Customer = z.infer<typeof Customer>;

export const OrderStatus = z.enum([
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderLine = z.object({
  productSlug: Slug,
  title: z.string(),
  qty: z.number().int().positive(),
  /** Prix unitaire figé à la commande : un changement de tarif ne réécrit pas l'historique. */
  unitPrice: Cents,
  image: ImageRef.optional(),
  preorder: z.boolean().default(false),
});

export const Order = z.object({
  id: z.string(),
  /** Numéro lisible et séquentiel, ex. MV-2026-00042. */
  number: z.string(),
  status: OrderStatus,
  lines: z.array(OrderLine).min(1),
  totals: z.object({
    subtotal: Cents,
    shipping: Cents,
    discount: Cents.default(0),
    tax: Cents.default(0),
    total: Cents,
    currency: z.literal("eur"),
  }),
  customerUid: z.string().optional(),
  email: z.email(),
  shippingAddress: Address,
  billingAddress: Address.optional(),
  stripe: z
    .object({
      checkoutSessionId: z.string().optional(),
      paymentIntentId: z.string().optional(),
      customerId: z.string().optional(),
    })
    .default({}),
  invoice: z
    .object({
      number: z.string(),
      issuedAt: z.number(),
      storagePath: z.string().optional(),
    })
    .optional(),
  tracking: z.object({ carrier: z.string(), number: z.string(), url: z.url().optional() }).optional(),
  /** Journal des transitions, pour comprendre a posteriori ce qui s'est passé. */
  timeline: z.array(
    z.object({
      at: z.number(),
      status: OrderStatus,
      note: z.string().optional(),
      by: z.string().optional(),
    }),
  ),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Order = z.infer<typeof Order>;
export type OrderLine = z.infer<typeof OrderLine>;

/* ---------- Contenus structurés des pages système ---------- */

/*
 * Les pages Accueil, Notre histoire et Contact ont une mise en page précise (héro,
 * tuiles, principes…) que le WYSIWYG ne saurait produire. Leur contenu est donc un
 * document structuré, édité champ par champ dans l'admin. C'est le compromis
 * « personnalisable sans être WordPress » : on change les textes et les images, pas
 * la composition.
 */

export const Cta = z.object({
  label: z.string().max(60).default(""),
  href: z.string().default(""),
});
export type Cta = z.infer<typeof Cta>;

export const HomeContent = z.object({
  hero: z.object({
    badge: z.string().max(60).default(""),
    heading: z.string().max(120).default(""),
    text: z.string().max(400).default(""),
    videoUrl: z.string().default(""),
    posterUrl: z.string().default(""),
    primary: Cta.default({ label: "", href: "" }),
    secondary: Cta.default({ label: "", href: "" }),
  }),
  tiles: z
    .array(z.object({ title: z.string().max(60), text: z.string().max(200), tint: Tint }))
    .max(4)
    .default([]),
  catalogue: z.object({
    heading: z.string().max(80).default("Mon vrai imagier"),
    linkLabel: z.string().max(60).default("Voir le catalogue →"),
    count: z.number().int().min(1).max(12).default(4),
  }),
  howTo: z.object({
    eyebrow: z.string().max(60).default(""),
    heading: z.string().max(120).default(""),
    text: z.string().max(600).default(""),
    image: ImageRef.optional(),
    cta: Cta.default({ label: "", href: "" }),
    tint: Tint.default("green"),
  }),
  story: z.object({
    eyebrow: z.string().max(60).default(""),
    heading: z.string().max(120).default(""),
    text: z.string().max(600).default(""),
    image: ImageRef.optional(),
    cta: Cta.default({ label: "", href: "" }),
  }),
  newsletter: z.object({
    heading: z.string().max(80).default("Restez curieux"),
    text: z.string().max(300).default(""),
    placeholder: z.string().max(60).default("Votre e-mail"),
    button: z.string().max(40).default("S'inscrire"),
  }),
  updatedAt: z.number(),
});
export type HomeContent = z.infer<typeof HomeContent>;

export const CatalogueContent = z.object({
  hero: z.object({
    /** [count] est remplacé par le nombre de titres publiés. */
    eyebrow: z.string().max(80).default("Collection 6–18 mois · [count] titres"),
    heading: z.string().max(120).default("Mon vrai imagier"),
    text: z.string().max(400).default(""),
    tint: Tint.default("green"),
  }),
  offer: z.object({
    enabled: z.boolean().default(false),
    title: z.string().max(80).default(""),
    compareAt: z.string().max(20).default(""),
    price: z.string().max(20).default(""),
    note: z.string().max(200).default(""),
    cta: Cta.default({ label: "", href: "" }),
  }),
  specs: z.array(z.object({ title: z.string().max(60), text: z.string().max(200) })).max(4).default([]),
  updatedAt: z.number(),
});
export type CatalogueContent = z.infer<typeof CatalogueContent>;

export const StoryContent = z.object({
  hero: z.object({
    eyebrow: z.string().max(60).default("Notre histoire"),
    heading: z.string().max(120).default(""),
    text: z.string().max(600).default(""),
    image: ImageRef.optional(),
    tint: Tint.default("pink"),
  }),
  intro: z.object({ heading: z.string().max(120), paragraphs: z.array(z.string()).max(6) }),
  principles: z
    .array(z.object({ eyebrow: z.string().max(40), title: z.string().max(80), text: z.string().max(300), tint: Tint }))
    .max(4)
    .default([]),
  gallery: z.array(ImageRef).max(4).default([]),
  walk: z.object({ heading: z.string().max(120), paragraphs: z.array(z.string()).max(6) }),
  cta: z.object({ heading: z.string().max(120), text: z.string().max(300), button: Cta }),
  updatedAt: z.number(),
});
export type StoryContent = z.infer<typeof StoryContent>;

export const ContactContent = z.object({
  intro: z.object({
    eyebrow: z.string().max(60).default("Contact"),
    heading: z.string().max(120).default(""),
    text: z.string().max(600).default(""),
  }),
  proLabel: z.string().max(80).default("Professionnels & revendeurs"),
  proText: z.string().max(400).default(""),
  subjects: z.array(z.string().max(60)).max(8).default([]),
  legal: z.string().max(300).default(""),
  successText: z.string().max(300).default(""),
  faq: z
    .object({
      heading: z.string().max(120).default(""),
      note: z.string().max(60).default("Questions fréquentes"),
      items: z.array(z.object({ q: z.string().max(200), a: z.string().max(800) })).max(12).default([]),
    })
    .default({ heading: "", note: "Questions fréquentes", items: [] }),
  updatedAt: z.number(),
});
export type ContactContent = z.infer<typeof ContactContent>;

/** Message reçu via le formulaire de contact. */
export const ContactMessage = z.object({
  id: z.string(),
  name: z.string().max(120).default(""),
  email: z.email(),
  phone: z.string().max(40).default(""),
  subject: z.string().max(60).default(""),
  body: z.string().min(1).max(5000),
  createdAt: z.number(),
  read: z.boolean().default(false),
});
export type ContactMessage = z.infer<typeof ContactMessage>;
