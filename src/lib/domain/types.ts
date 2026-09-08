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

export const ShippingRate = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(80).default(""),
  price: Cents,
  /** Offert quand le panier atteint le seuil de livraison offerte. */
  freeAboveThreshold: z.boolean().default(false),
  enabled: z.boolean().default(true),
  /** Offre Boxtal utilisée pour créer l'étiquette (ex. MONR-CpourToi). Vide : expédition manuelle. */
  boxtalOfferCode: z.string().max(60).default(""),
  /** Livraison en point relais : le client choisit un point sur la carte Boxtal. */
  relay: z.boolean().default(false),
  /** Réseaux de points relais à afficher sur la carte (ex. MONR_NETWORK). */
  networks: z.array(z.string()).default([]),
});
export type ShippingRate = z.infer<typeof ShippingRate>;

export const DEFAULT_SHIPPING_RATES: ShippingRate[] = [
  { id: "mondial-relay", name: "Mondial Relay — point relais", description: "3 à 5 jours", price: 390, freeAboveThreshold: true, enabled: true, boxtalOfferCode: "MONR-CpourToi", relay: true, networks: ["MONR_NETWORK"] },
  { id: "colissimo", name: "Colissimo — domicile", description: "2 à 3 jours", price: 590, freeAboveThreshold: false, enabled: true, boxtalOfferCode: "POFR-ColissimoAccess", relay: false, networks: [] },
  { id: "chronopost", name: "Chronopost — express", description: "J+1", price: 990, freeAboveThreshold: false, enabled: true, boxtalOfferCode: "CHRP-Chrono13", relay: false, networks: [] },
];

/** Colis par défaut pour Boxtal : un carton de livres 14 × 14 cm. */
export const ParcelDefaults = z.object({
  lengthCm: z.number().int().min(1).default(16),
  widthCm: z.number().int().min(1).default(16),
  heightCm: z.number().int().min(1).default(4),
  /** Poids d'un livre, en grammes. */
  unitWeightG: z.number().int().min(1).default(180),
  /** Emballage, en grammes. */
  baseWeightG: z.number().int().min(0).default(60),
  /** Catégorie de contenu Boxtal (GET /content-category) ; « Livres ». */
  contentCategoryId: z.string().default("content:v1:10150"),
  labelType: z.enum(["PDF_A4", "PDF_10x15"]).default("PDF_10x15"),
});
export type ParcelDefaults = z.infer<typeof ParcelDefaults>;
export const DEFAULT_PARCEL: ParcelDefaults = { lengthCm: 16, widthCm: 16, heightCm: 4, unitWeightG: 180, baseWeightG: 60, contentCategoryId: "content:v1:10150", labelType: "PDF_10x15" };

/** Expéditeur déclaré à Boxtal (adresse de collecte / d'expédition). */
export const Sender = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  company: z.string().default(""),
  street: z.string().default(""),
  postalCode: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("FR"),
  email: z.string().default(""),
  phone: z.string().default(""),
});
export type Sender = z.infer<typeof Sender>;
export const EMPTY_SENDER: Sender = { firstName: "", lastName: "", company: "", street: "", postalCode: "", city: "", country: "FR", email: "", phone: "" };

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
      /** Modes de livraison proposés à la caisse (Stripe les affiche et les encaisse). */
      rates: z.array(ShippingRate).default(DEFAULT_SHIPPING_RATES),
      parcel: ParcelDefaults.default(DEFAULT_PARCEL),
      sender: Sender.default(EMPTY_SENDER),
    })
    .default({ freeThreshold: 3000, countries: ["FR", "BE", "LU"], rates: DEFAULT_SHIPPING_RATES, parcel: DEFAULT_PARCEL, sender: EMPTY_SENDER }),
  inventory: z
    .object({
      /** En dessous de ce nombre d'exemplaires, un titre est signalé « stock bas ». */
      lowThreshold: z.number().int().min(0).default(20),
    })
    .default({ lowThreshold: 20 }),
  payments: z
    .object({
      /** « test » : clés Stripe de test, commandes marquées, pas de facture. */
      mode: z.enum(["live", "test"]).default("live"),
    })
    .default({ mode: "live" }),
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
  /** Ancien champ (un seul code) : lu pour compatibilité, plus écrit. */
  promoCode: z.string().max(40).optional(),
  /** Codes promo appliqués (validés à l'ajout, revalidés au paiement). */
  promoCodes: z.array(z.string().max(40)).default([]),
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
  /** Identifiant du client dans Tiime (facturation), renvoyé par le scénario Make. */
  tiimeClientId: z.number().int().optional(),
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
  /** Article offert par un code promo (prix unitaire 0). */
  gift: z.boolean().default(false),
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
  /** false : payée avec les clés Stripe de test. Jamais facturée, exclue du chiffre d'affaires. */
  livemode: z.boolean().default(true),
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
  /** Mode de livraison choisi à la caisse, et point relais le cas échéant. */
  delivery: z
    .object({
      rateId: z.string(),
      rateName: z.string(),
      offerCode: z.string().default(""),
      relay: z
        .object({
          code: z.string(),
          name: z.string(),
          street: z.string().default(""),
          postalCode: z.string().default(""),
          city: z.string().default(""),
          network: z.string().default(""),
        })
        .optional(),
    })
    .optional(),
  /** Codes promo appliqués à cette commande. */
  promoCodes: z.array(z.string()).default([]),
  /** Vente attribuée à un influenceur : par son code, ou par son lien (cookie 30 jours). */
  attribution: z.object({ influencerId: z.string(), via: z.enum(["code", "link"]) }).optional(),
  /** Facturation Tiime (via Make) : identifiants renvoyés par le scénario. */
  tiime: z.object({ clientId: z.number().int().optional(), invoiceId: z.string().optional(), at: z.number() }).optional(),
  /** Expédition créée chez Boxtal : référence, statut, étiquette, dernier suivi. */
  boxtal: z
    .object({
      orderId: z.string(),
      status: z.string().default("PENDING"),
      createdAt: z.number(),
      /** Étiquette archivée dans le bucket (l'URL Boxtal expire). */
      labelPath: z.string().optional(),
      trackingNumber: z.string().optional(),
      trackingUrl: z.string().optional(),
      trackingStatus: z.string().optional(),
      trackingMessage: z.string().optional(),
      updatedAt: z.number().optional(),
    })
    .optional(),
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
      items: z
        .array(
          z.object({
            q: z.string().max(200),
            a: z.string().max(800),
            /** Rubrique libre (Précommande, Livraison, Retours, Les livres…). */
            cat: z.string().max(40).default(""),
            /** Masquée : conservée dans l'admin, absente du site. */
            hidden: z.boolean().default(false),
          }),
        )
        .max(30)
        .default([]),
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

/* ---------- Codes promo et influenceurs ---------- */

export const PromoType = z.enum(["percent", "fixed", "free_shipping", "gift"]);
export type PromoType = z.infer<typeof PromoType>;

/** Un code promo maison. `code` est aussi l'identifiant du document (majuscules). */
export const Promo = z.object({
  code: z.string().min(2).max(24).regex(/^[A-Z0-9]+$/),
  description: z.string().max(120).default(""),
  type: PromoType,
  /** Pourcentage (0–100) pour `percent`, centimes pour `fixed`, ignoré sinon. */
  amount: z.number().int().min(0).default(0),
  /** Panier minimum, en centimes ; 0 = aucun. */
  minimum: Cents.default(0),
  startAt: z.number(),
  endAt: z.number().optional(),
  /** Nombre total d'utilisations autorisées ; absent = illimité. */
  limit: z.number().int().min(1).optional(),
  perCustomer: z.number().int().min(1).default(1),
  /** Codes avec lesquels celui-ci se cumule ; `__influ` = n'importe quel code influenceur. */
  stackWith: z.array(z.string()).default([]),
  /** Produits offerts (type `gift`), un exemplaire chacun. */
  gifts: z.array(Slug).default([]),
  active: z.boolean().default(true),
  /** Code rattaché à un influenceur : géré depuis l'onglet Influenceurs. */
  influencerId: z.string().optional(),
  uses: z.number().int().min(0).default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Promo = z.infer<typeof Promo>;

export const Platform = z.enum(["Instagram", "TikTok", "YouTube", "Blog", "Autre"]);
export type Platform = z.infer<typeof Platform>;

export const Influencer = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  handle: z.string().max(80).default(""),
  platform: Platform.default("Instagram"),
  /** Identifiant du lien de suivi : monvrai.fr/?ref=<slug>. */
  slug: Slug,
  /** Code promo de l'influenceur (document `promos/<code>`). */
  code: z.string().min(2).max(24).regex(/^[A-Z0-9]+$/),
  /** Remise offerte au client, en pourcentage. */
  discount: z.number().int().min(0).max(100).default(10),
  /** Commission de l'influenceur, en pourcentage du CA HT attribué. */
  rate: z.number().int().min(0).max(100).default(10),
  endAt: z.number().optional(),
  active: z.boolean().default(true),
  clicks: z.number().int().min(0).default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Influencer = z.infer<typeof Influencer>;

/** Compteur de clics par jour : document `refClicks/<influencerId>_<AAAA-MM-JJ>`. */
export const RefClicks = z.object({ influencerId: z.string(), day: z.string(), count: z.number().int().min(0) });
export type RefClicks = z.infer<typeof RefClicks>;
