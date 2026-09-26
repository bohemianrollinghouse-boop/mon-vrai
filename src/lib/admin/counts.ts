import "server-only";
import { listContactMessages } from "@/lib/db/content";
import { listContests } from "@/lib/db/contests";
import { listOrders } from "@/lib/db/orders";
import { listAllProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import type { Order, Product, SiteSettings } from "@/lib/domain/types";
import { CONTEST_TODO, contestState } from "@/lib/contests/state";
import { tookSaleStock } from "@/lib/domain/order-state";
import { TO_SHIP } from "./order-ui";

/** Chiffres partagés par la barre latérale (badges) et le tableau de bord. */
export async function adminSnapshot() {
  const [settings, orders, products, messages, contests] = await Promise.all([
    getSettings(),
    listOrders({ limit: 500 }),
    listAllProducts(),
    listContactMessages(100),
    listContests().catch(() => []),
  ]);
  const now = Date.now();
  return {
    now,
    settings,
    orders,
    products,
    messages,
    toShip: orders.filter((o) => TO_SHIP.includes(o.status)).length,
    lowStock: lowStockProducts(products, settings),
    unread: messages.filter((m) => !m.read).length,
    /* Les concours qui attendent quelque chose de nous : un tirage à faire, un lot à envoyer. */
    contestsTodo: contests.filter((c) => CONTEST_TODO.includes(contestState(c, now))).length,
  };
}

export function lowStockProducts(products: Product[], settings: SiteSettings): Product[] {
  return products.filter((p) => p.status === "published" && p.stock !== null && p.stock < settings.inventory.lowThreshold);
}

/** Exemplaires par produit dans les commandes payées non expédiées : « réservés ». */
export function reservedBySlug(orders: Order[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    // Un colis offert ne réserve d'exemplaires que s'ils ont été pris sur le stock de vente.
    if (!tookSaleStock(o) || !TO_SHIP.includes(o.status)) continue;
    for (const l of o.lines) m.set(l.productSlug, (m.get(l.productSlug) ?? 0) + l.qty);
  }
  return m;
}
