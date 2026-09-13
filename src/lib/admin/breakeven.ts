import type { Costs } from "@/lib/domain/types";

/*
 * Le livre à partir duquel le tirage est remboursé.
 *
 * Un imagier se vend un prix ; il en part les cotisations, la commission du paiement et
 * sa fabrication. Ce qui reste, multiplié par le nombre d'exemplaires vendus, rembourse
 * peu à peu ce que la production a coûté. Le calcul est volontairement simple — c'est
 * un cap, pas un bilan : le port, l'emballage et les kits offerts vivent dans
 * `lib/admin/revenue.ts`, qui dit, lui, ce qu'il reste vraiment.
 *
 * Pur : mêmes entrées, mêmes sorties, et vérifiable à la main.
 */

export type BreakEven = {
  /** Prix de vente d'un imagier, en centimes. */
  price: number;
  urssaf: number;
  stripe: number;
  bookCost: number;
  /** Ce qu'un livre vendu laisse, une fois tout retiré. Peut être négatif. */
  perBook: number;
  /** Production à amortir, en centimes. */
  production: number;
  /** Rang du livre qui franchit l'objectif ; null si un livre ne rapporte rien. */
  target: number | null;
};

export function breakEven(costs: Costs): BreakEven {
  const price = costs.bookPrice;
  /* Arrondis au centime, dans l'ordre où la banque les prélève. */
  const urssaf = Math.round((price * costs.urssafBp) / 10_000);
  const stripe = Math.round((price * costs.stripeBp) / 10_000) + costs.stripeFixed;
  const perBook = price - urssaf - stripe - costs.bookCost;
  return {
    price,
    urssaf,
    stripe,
    bookCost: costs.bookCost,
    perBook,
    production: costs.productionCost,
    /* Le livre qui FRANCHIT l'objectif : 486 × 7,20 € n'y suffit pas, le 487e oui. */
    target: perBook > 0 && costs.productionCost > 0 ? Math.ceil(costs.productionCost / perBook) : null,
  };
}
