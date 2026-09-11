import "server-only";
import { listOrders } from "./orders";
import { listRefClicksSince } from "./promos";
import { partnerView, periodStart, type PartnerPeriod, type PartnerView } from "@/lib/promos/partner";
import { statementRows, type StatementRow } from "@/lib/promos/statements";
import { listStatements } from "./statements";
import { getSettings } from "./settings";
import type { Influencer } from "@/lib/domain/types";
import { now } from "./helpers";

/*
 * Tout ce que l'espace partenaire affiche, en une lecture. L'horloge est lue ici et
 * non dans la page : un composant serveur doit rester pur (react-hooks/purity), et
 * c'est déjà la règle ailleurs — adminSnapshot() renvoie son `now` de la même façon.
 */
export async function partnerSnapshot(
  influencer: Influencer,
  period: PartnerPeriod,
): Promise<{ now: number; view: PartnerView; statements: StatementRow[]; kit: { name: string; meta: string; url: string }[] }> {
  const at = now();
  const since = periodStart(period, at);
  const sinceDay = new Date(since ?? influencer.createdAt).toISOString().slice(0, 10);
  const [orders, clicks, stored, settings] = await Promise.all([
    listOrders({ limit: 2000 }),
    listRefClicksSince(sinceDay).catch(() => []),
    influencer.commission ? listStatements(influencer.id) : Promise.resolve([]),
    getSettings(),
  ]);
  return {
    now: at,
    view: partnerView(influencer, orders, clicks, at, period),
    // Les relevés couvrent toute l'histoire, pas seulement la fenêtre choisie.
    statements: statementRows(influencer, orders, stored, at),
    kit: settings.partnerKit,
  };
}
