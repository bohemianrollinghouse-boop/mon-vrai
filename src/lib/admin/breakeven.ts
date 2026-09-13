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

/*
 * Ce que les ventes ont RÉELLEMENT remboursé du tirage.
 *
 * Le seuil ci-dessus suppose un imagier vendu plein tarif. La réalité est plus molle :
 * un code promo fait rentrer moins, et le neuvième livre offert ne rapporte rien tout en
 * coûtant sa fabrication. Compter les exemplaires et les multiplier par 7,20 € ferait
 * donc fêter un remboursement qui n'a pas eu lieu.
 *
 * On cumule alors, commande par commande, ce qu'elle a laissé :
 *
 *   prix des livres réellement encaissé (remise déduite, port exclu)
 *   − cotisations et commission, qui portent sur l'encaissement ENTIER, port compris
 *   − la fabrication de tous les exemplaires partis, cadeaux compris
 *
 * Le port et l'emballage n'y sont pas : ils sont censés s'équilibrer, et le calcul du
 * seuil ne les comptait pas non plus. C'est `lib/admin/revenue.ts` qui dit, lui, ce qui
 * reste vraiment une fois tout payé.
 */
export type Amortisation = {
  /** Exemplaires partis dans des ventes, cadeaux compris : ils sortent tous du tirage. */
  books: number;
  /** Dont offerts (neuvième livre, code cadeau) : ils ne remboursent rien. */
  gifted: number;
  /** Remboursé à ce jour, en centimes. */
  amortised: number;
  production: number;
  /** Avancement, de 0 à 100. */
  pct: number;
  /** Ce qu'un exemplaire a remboursé en moyenne — promotions et cadeaux compris. */
  perBook: number;
  /** Exemplaires restants à ce rythme ; null tant qu'aucune vente ne permet d'estimer. */
  remaining: number | null;
  reached: boolean;
};

type Sale = {
  totals: { total: number; shipping: number };
  lines: { qty: number; gift: boolean }[];
};

export function amortisation(sales: Sale[], costs: Costs): Amortisation {
  let books = 0;
  let gifted = 0;
  let amortised = 0;

  for (const o of sales) {
    const shipped = o.lines.reduce((n, l) => n + l.qty, 0);
    books += shipped;
    gifted += o.lines.filter((l) => l.gift).reduce((n, l) => n + l.qty, 0);

    const goods = Math.max(0, o.totals.total - o.totals.shipping);
    const urssaf = Math.round((o.totals.total * costs.urssafBp) / 10_000);
    const stripe = o.totals.total > 0 ? Math.round((o.totals.total * costs.stripeBp) / 10_000) + costs.stripeFixed : 0;
    amortised += goods - urssaf - stripe - shipped * costs.bookCost;
  }

  const production = costs.productionCost;
  const perBook = books > 0 ? Math.round(amortised / books) : 0;
  const left = production - amortised;
  return {
    books,
    gifted,
    amortised,
    production,
    pct: production > 0 ? Math.min(100, Math.max(0, (amortised / production) * 100)) : 0,
    perBook,
    remaining: left <= 0 ? 0 : perBook > 0 ? Math.ceil(left / perBook) : null,
    reached: production > 0 && amortised >= production,
  };
}
