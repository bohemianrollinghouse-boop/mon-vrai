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
  /** Réglage admin : l'offre est-elle activée ? Si non, rien ne s'applique ni ne s'affiche. */
  enabled: boolean;
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
 * `ownedSlugs` = slugs présents dans le panier (quantité ≥ 1). Le calcul ne dépend pas
 * des quantités : la collection est « complète » dès qu'un exemplaire de chaque titre y
 * figure.
 */
export function collectionState(published: CollectionTitle[], ownedSlugs: Set<string>, enabled: boolean): CollectionState {
  const totalTitles = published.length;
  const missing = published.filter((p) => !ownedSlugs.has(p.slug));
  // Complète si tous les titres publiés sont dans le panier (et qu'il y a au moins un titre).
  const complete = totalTitles > 0 && missing.length === 0;
  const cheapest = published.reduce((min, p) => Math.min(min, p.price), published[0]?.price ?? 0);
  const giftAmount = totalTitles > 0 ? cheapest : 0;
  const fullPrice = published.reduce((s, p) => s + p.price, 0);
  const offerPrice = Math.max(0, fullPrice - giftAmount);
  const missingCost = missing.reduce((s, p) => s + p.price, 0);
  return { enabled, totalTitles, missing, complete, giftAmount, fullPrice, offerPrice, missingCost };
}

/** Remise à appliquer côté serveur (0 si l'offre est désactivée ou la collection incomplète). */
export function collectionDiscount(state: CollectionState): number {
  return state.enabled && state.complete ? state.giftAmount : 0;
}

/** Étiquette de la ligne de remise, cohérente entre panier, paiement et modal. */
export const COLLECTION_DISCOUNT_LABEL = "Collection complète — 1 livre offert";

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
