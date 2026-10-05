import type { Product } from "@/lib/domain/types";

/*
 * Offre « collection complète », sans effet de bord : à partir des titres publiés et du
 * contenu du panier, elle dit si la collection est complète, quels titres manquent, et
 * quelle remise appliquer. La règle est « un livre offert » — le moins cher des titres
 * de la collection, un seul exemplaire — pour que le montant grandisse si le catalogue
 * s'agrandit, plutôt qu'un rabais figé en dur.
 *
 * Le panier, la page catalogue, la page panier et le devis serveur partagent ce calcul :
 * un seul comportement possible, quel que soit l'endroit qui l'affiche.
 */

export type CollectionTitle = {
  slug: string;
  title: string;
  price: number;
  image?: string;
  tint: Product["tint"];
  preorder: boolean;
  ageLabel: string;
};

export type CollectionState = {
  /*
   * L'offre court-elle AUJOURD'HUI ? C'est-à-dire : activée dans les réglages, et pas
   * encore arrivée à son jour d'arrêt (voir offerRunning). Si non, rien ne s'applique
   * ni ne s'affiche.
   */
  running: boolean;
  /** Nombre de titres publiés (la « collection »). */
  totalTitles: number;
  /** Titres publiés absents du panier (à ajouter pour compléter). */
  missing: CollectionTitle[];
  /** Le panier contient-il au moins un exemplaire de chaque titre publié ? */
  complete: boolean;
  /** Remise appliquée quand la collection est complète : prix du titre le moins cher. */
  giftAmount: number;
  /** Prix plein de la collection (un exemplaire de chaque titre). */
  fullPrice: number;
  /** Prix de la collection avec l'offre (plein − un livre offert). */
  offerPrice: number;
  /** Coût des titres manquants (pour le bouton « Compléter · +X € »). */
  missingCost: number;
};

/**
 * Calcule l'état de l'offre collection. `published` = titres publiés (prix en centimes) ;
 * `ownedSlugs` = slugs présents dans le panier (quantité ≥ 1) ; `running` = l'offre
 * court-elle aujourd'hui (offerRunning, et non le seul interrupteur des réglages). Le calcul ne dépend pas
 * des quantités : la collection est « complète » dès qu'un exemplaire de chaque titre y
 * figure.
 */
export function collectionState(published: CollectionTitle[], ownedSlugs: Set<string>, running: boolean): CollectionState {
  const totalTitles = published.length;
  const missing = published.filter((p) => !ownedSlugs.has(p.slug));
  // Complète si tous les titres publiés sont dans le panier (et qu'il y a au moins un titre).
  const complete = totalTitles > 0 && missing.length === 0;
  const cheapest = published.reduce((min, p) => Math.min(min, p.price), published[0]?.price ?? 0);
  const giftAmount = totalTitles > 0 ? cheapest : 0;
  const fullPrice = published.reduce((s, p) => s + p.price, 0);
  const offerPrice = Math.max(0, fullPrice - giftAmount);
  const missingCost = missing.reduce((s, p) => s + p.price, 0);
  return { running, totalTitles, missing, complete, giftAmount, fullPrice, offerPrice, missingCost };
}

/** Remise à appliquer côté serveur (0 si l'offre ne court pas ou la collection est incomplète). */
export function collectionDiscount(state: CollectionState): number {
  return state.running && state.complete ? state.giftAmount : 0;
}

/** Étiquette de la ligne de remise, cohérente entre panier, paiement et modal. */
export const COLLECTION_DISCOUNT_LABEL = "Collection complète — 1 livre offert";

/*
 * L'offre ne se cumule avec AUCUN code promo : un livre offert est déjà la remise la
 * plus forte qu'on consente, et l'empiler avec un code reviendrait à vendre la
 * collection à perte. C'est l'offre qui l'emporte — elle vient du panier lui-même et
 * n'a pas à être réclamée —, et le code est refusé en le disant (voir engine.ts, qui
 * porte ce refus jusqu'au panier et à la caisse).
 */
export const COLLECTION_EXCLUSIVE_REASON = "Votre panier bénéficie déjà de l'offre collection complète (1 livre offert) : elle ne se cumule pas avec un code promo.";

/* ---------- La durée de l'offre ---------- */

/** Les réglages de l'offre : l'interrupteur, et le jour où elle s'arrête. */
export type CollectionOffer = { enabled: boolean; endsOn?: string };

/*
 * Le jour civil (heure de Paris) d'un instant, en AAAA-MM-JJ.
 *
 * L'offre se compte en JOURS et non en horodatages : c'est une date qu'on annonce aux
 * clients, et elle doit tomber à minuit chez eux, pas à l'heure UTC. Comparer deux
 * chaînes de ce format revient à comparer deux jours — c'est déjà ce que font les
 * dépenses et leurs mois.
 */
export function offerDay(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/*
 * L'offre court-elle le jour dit ? Activée, et avant son jour d'arrêt — celui-ci est le
 * premier jour SANS offre, si bien qu'elle s'éteint d'elle-même à son lever, sans que
 * personne ait à toucher l'interrupteur ni à passer une tâche.
 */
export function offerRunning(offer: CollectionOffer, today: string): boolean {
  return offer.enabled && (!offer.endsOn || today < offer.endsOn);
}

/** L'offre est-elle derrière nous ? (datée, et le jour venu) — pour le dire dans l'admin. */
export function offerOver(offer: CollectionOffer, today: string): boolean {
  return Boolean(offer.endsOn) && today >= offer.endsOn!;
}

/** Un jour civil en toutes lettres : « 5 octobre 2026 ». */
export function formatOfferDay(day: string): string {
  // Midi UTC : aucun fuseau ne peut faire glisser la date d'un jour en l'affichant.
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/*
 * Ce qu'on annonce au client, partout où l'offre est proposée — une seule phrase, écrite
 * une seule fois : l'encart du catalogue, le bloc du panier et la modal disent tous la
 * même chose, et changer la date ne laisse rien derrière.
 */
export function offerEndNotice(endsOn: string): string {
  return `L'offre s'arrête le ${formatOfferDay(endsOn)}.`;
}

/*
 * L'instant précis où l'offre s'arrête : minuit, heure de Paris, au premier instant du
 * jour d'arrêt. Le reste du code raisonne en JOURS (voir offerDay) ; un compte à rebours,
 * lui, a besoin d'un horodatage, et il doit tomber à minuit CHEZ LE CLIENT — c'est la
 * même exigence que `offerDay`, poussée à la seconde.
 *
 * Le décalage de Paris se lit sur l'instant lui-même, et pas une fois pour toutes : il
 * vaut +1 h ou +2 h selon la saison. On part de minuit UTC, on retire le décalage, puis
 * on recommence — la seconde passe rattrape le cas (rare) où le changement d'heure tombe
 * entre les deux instants.
 */
export function offerEndsAt(endsOn: string): number {
  const utcMidnight = Date.parse(`${endsOn}T00:00:00Z`);
  let at = utcMidnight;
  for (let i = 0; i < 2; i++) at = utcMidnight - parisOffset(at);
  return at;
}

/** Décalage Paris − UTC (en millisecondes) à un instant donné. */
function parisOffset(at: number): number {
  // L'heure de Paris relue comme si elle était UTC : l'écart au vrai instant EST le décalage.
  const asParis = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return Date.parse(`${asParis.replace(" ", "T")}Z`) - at;
}

/*
 * Sommes-nous le DERNIER jour de l'offre — celui où il ne reste que jusqu'à minuit ?
 * C'est la seule chose dont la page d'accueil a besoin pour décider d'annoncer la fin :
 * elle se déduit du jour d'arrêt, et rien n'est donc à allumer ni à éteindre à la main.
 */
export function offerLastDay(offer: CollectionOffer, today: string): boolean {
  return offerRunning(offer, today) && Boolean(offer.endsOn) && today === dayBefore(offer.endsOn!);
}

/** La veille d'un jour civil : le dernier jour où l'offre est servie (dit dans l'admin). */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Construit la liste des titres de collection depuis des produits publiés. */
export function toCollectionTitles(products: Product[]): CollectionTitle[] {
  return products.map((p) => ({
    slug: p.slug,
    title: p.title,
    price: p.price,
    image: p.images[0]?.url,
    tint: p.tint,
    preorder: p.preorder.enabled,
    ageLabel: p.ageLabel,
  }));
}
