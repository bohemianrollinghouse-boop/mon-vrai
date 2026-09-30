import "server-only";
import type { KitChoice } from "@/components/admin/WelcomeKitEditor";
import { influenceRows } from "@/lib/admin/influence-stock";
import { clockNow, listAllCampaigns } from "@/lib/db/campaigns";
import { listContests } from "@/lib/db/contests";
import { listOrders } from "@/lib/db/orders";
import type { Product } from "@/lib/domain/types";

/*
 * Les titres proposés au kit d'une campagne ou au lot d'un concours, avec le nombre qui
 * décide vraiment : le DISPONIBLE.
 *
 * Le stock influence, lui, n'est qu'une déclaration — ce qu'on a mis de côté depuis
 * toujours, y compris ce qui est déjà parti en kit. L'afficher ici laisserait promettre
 * des exemplaires qui ne sont plus sur l'étagère ; c'est stock − envoyé − réservé qu'on
 * montre, exactement la colonne « Disponible » de /admin/stocks.
 *
 * `exceptId` est la campagne (participation) ou le concours qu'on modifie : sa propre
 * promesse ne doit pas se retrancher de ce qu'il a le droit de promettre.
 */
export async function kitChoices(products: Product[], exceptId?: string): Promise<KitChoice[]> {
  const [orders, campaigns, contests, now] = await Promise.all([
    listOrders({ limit: 500 }),
    listAllCampaigns(),
    listContests().catch(() => []),
    clockNow(),
  ]);
  const rows = new Map(
    influenceRows(products, orders.filter((o) => o.livemode), campaigns, contests, now, exceptId).map((r) => [r.slug, r]),
  );
  return products.map((p) => ({
    slug: p.slug,
    title: p.title,
    image: p.images[0]?.url,
    tint: p.tint,
    stock: p.stock,
    available: rows.get(p.slug)?.available ?? p.influenceStock,
  }));
}
