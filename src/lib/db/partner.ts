import "server-only";
import { findKitOrder, listOrders } from "./orders";
import { listRefClicksSince } from "./promos";
import { partnerView, periodStart, type PartnerPeriod, type PartnerView } from "@/lib/promos/partner";
import { statementRows, type StatementRow } from "@/lib/promos/statements";
import { listStatements } from "./statements";
import { getSettings } from "./settings";
import { listAllProducts } from "./products";
import { kitItems, kitOffered, type KitItem } from "@/lib/promos/kit";
import type { Influencer, Order } from "@/lib/domain/types";
import { now } from "./helpers";

/*
 * Kit de bienvenue vu par le partenaire : ce qu'on lui offre, et — s'il l'a déjà
 * commandé — la commande, d'où viendra le suivi. Les produits sont lus en entier
 * (pas seulement les publiés) : un kit ne dépend pas de la mise en vente d'un titre.
 */
export type PartnerKit = { title: string; text: string; items: KitItem[]; offered: boolean; order: Order | null };

export async function partnerKitSnapshot(influencer: Influencer): Promise<PartnerKit> {
  const [settings, products, order] = await Promise.all([getSettings(), listAllProducts(), findKitOrder(influencer.id)]);
  const kit = settings.welcomeKit;
  const items = kitItems(kit, products);
  return { title: kit.title, text: kit.text, items, offered: kitOffered(kit, items), order };
}

/*
 * Tout ce que l'espace partenaire affiche, en une lecture. L'horloge est lue ici et
 * non dans la page : un composant serveur doit rester pur (react-hooks/purity), et
 * c'est déjà la règle ailleurs — adminSnapshot() renvoie son `now` de la même façon.
 */
export async function partnerSnapshot(
  influencer: Influencer,
  period: PartnerPeriod,
): Promise<{ now: number; view: PartnerView; statements: StatementRow[]; kit: PartnerKit }> {
  const at = now();
  const since = periodStart(period, at);
  const sinceDay = new Date(since ?? influencer.createdAt).toISOString().slice(0, 10);
  const [orders, clicks, stored, kit] = await Promise.all([
    listOrders({ limit: 2000 }),
    listRefClicksSince(sinceDay).catch(() => []),
    influencer.commission ? listStatements(influencer.id) : Promise.resolve([]),
    partnerKitSnapshot(influencer),
  ]);
  return {
    now: at,
    view: partnerView(influencer, orders, clicks, at, period),
    // Les relevés couvrent toute l'histoire, pas seulement la fenêtre choisie.
    statements: statementRows(influencer, orders, stored, at),
    kit,
  };
}
