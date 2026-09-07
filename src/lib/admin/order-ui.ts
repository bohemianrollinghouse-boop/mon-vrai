import type { PillTone } from "@/components/admin/ui";
import type { Order, OrderStatus } from "@/lib/domain/types";

/*
 * Vocabulaire de l'admin pour les commandes : « À expédier » plutôt que « Payée »,
 * parce que c'est ce que le statut signifie pour la personne qui prépare les colis.
 * Le site client garde ORDER_STATUS_LABELS.
 */

export const ADMIN_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente",
  paid: "À expédier",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export const STATUS_TONE: Record<OrderStatus, PillTone> = {
  pending_payment: "muted",
  paid: "warn",
  preparing: "warn",
  shipped: "blue",
  delivered: "ok",
  cancelled: "muted",
  refunded: "muted",
};

/** Filtres de la liste : un identifiant d'URL → les statuts qu'il regroupe. */
export const ORDER_FILTERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "a-expedier", label: "À expédier", statuses: ["paid", "preparing"] },
  { key: "expediees", label: "Expédiée", statuses: ["shipped"] },
  { key: "livrees", label: "Livrée", statuses: ["delivered"] },
  { key: "remboursees", label: "Remboursée", statuses: ["refunded", "cancelled"] },
];

export const TO_SHIP: OrderStatus[] = ["paid", "preparing"];
export const COUNTED: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function longDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** « 2× Anim. ferme, 1× Fruits » : titres raccourcis pour tenir dans une colonne. */
export function itemsSummary(order: Order): string {
  return order.lines.map((l) => `${l.qty}× ${shortTitle(l.title)}`).join(", ");
}

export function shortTitle(title: string): string {
  return title.replace(/^Les Animaux de /i, "Anim. ").replace(/^Les Objets du quotidien$/i, "Objets").replace(/^Les /i, "").replace(/^Le /i, "");
}

export function matchesQuery(order: Order, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [order.number, order.email, order.shippingAddress.name, order.shippingAddress.city].some((v) => v.toLowerCase().includes(needle));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
