import type { OrderStatus } from "./types";

/*
 * Machine à états des commandes. Toute transition passe par `assertTransition` :
 * une commande ne peut pas être « expédiée » avant d'être « payée », ni revenir en
 * arrière. Le journal `timeline[]` de la commande garde la trace de chaque passage.
 */

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "refunded", "cancelled"],
  preparing: ["shipped", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition de commande interdite : ${from} → ${to}`);
  }
}

/** Statuts après lesquels le stock a été consommé et doit être rendu en cas d'annulation. */
export function stockIsReserved(status: OrderStatus): boolean {
  return status !== "pending_payment" && status !== "cancelled" && status !== "refunded";
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  paid: "Payée",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

/**
 * Numéro de commande lisible : MV-2026-00042. Le compteur est séquentiel par an ;
 * l'année vient de la date de création, jamais de « maintenant », pour qu'un
 * re-traitement ne change pas le numéro.
 */
export function formatOrderNumber(seq: number, createdAt: number): string {
  const year = new Date(createdAt).getUTCFullYear();
  return `MV-${year}-${String(seq).padStart(5, "0")}`;
}

/**
 * Numéro de facture : F-2026-00042. Séquentiel et sans trou, exigence légale
 * française — d'où un compteur distinct du numéro de commande, car toutes les
 * commandes ne donnent pas lieu à facture (annulées avant paiement).
 */
export function formatInvoiceNumber(seq: number, issuedAt: number, test = false): string {
  const year = new Date(issuedAt).getUTCFullYear();
  return `F-${test ? "TEST-" : ""}${year}-${String(seq).padStart(5, "0")}`;
}

/*
 * Une commande OFFERTE : kit de partenaire, ou lot de concours. Elle n'encaisse rien,
 * ne donne pas lieu à facture et ne compte pas dans le chiffre d'affaires — trois règles
 * qui ne dépendent pas de la raison du cadeau. D'où un seul prédicat, plutôt qu'un
 * `order.kit` recopié partout qui oublierait les lots le jour où ils sont arrivés.
 */
/*
 * Cette commande a-t-elle pris sur le stock de vente ? Une vente, toujours ; un colis
 * offert — kit ou lot —, seulement si on l'a demandé. L'annulation doit rendre
 * exactement ce qui avait été pris, quoi qu'on ait réglé depuis ; et un exemplaire qui
 * n'a pas été pris n'est pas « réservé ».
 */
export const tookSaleStock = (order: { kit?: { stock: boolean }; prize?: { stock: boolean } }): boolean =>
  order.kit ? order.kit.stock : order.prize ? order.prize.stock : true;

export const offeredOrder = (order: { kit?: unknown; prize?: unknown }): boolean => Boolean(order.kit || order.prize);
