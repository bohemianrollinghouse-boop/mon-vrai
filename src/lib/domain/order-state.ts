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
