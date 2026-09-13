import "server-only";
import { findKitOrder, listOrders } from "./orders";
import { listRefClicksSince } from "./promos";
import { listCampaigns } from "./campaigns";
import { getSignature } from "./contracts";
import { partnerView, periodStart, type PartnerPeriod, type PartnerView } from "@/lib/promos/partner";
import { statementRows, type StatementRow } from "@/lib/promos/statements";
import { listStatements } from "./statements";
import { listAllProducts } from "./products";
import { kitItems, kitOffered, type KitItem } from "@/lib/promos/kit";
import { socialCount } from "@/lib/promos/socials";
import type { Campaign, ContractSignature, Influencer, Order } from "@/lib/domain/types";
import { now } from "./helpers";

/*
 * Kit de bienvenue vu par le partenaire : ce qu'on lui offre dans la campagne en cours,
 * et, s'il l'a déjà commandé, la commande d'où viendra le suivi. Les produits sont lus
 * en entier (pas seulement les publiés) : un kit ne dépend pas de la mise en vente d'un
 * titre. Sans campagne ouverte, il n'y a rien à offrir — et l'encart disparaît.
 */
export type PartnerKit = {
  title: string;
  text: string;
  items: KitItem[];
  offered: boolean;
  prototype: boolean;
  order: Order | null;
  /** Au moins un réseau renseigné : sans cela la demande de kit n'a pas de sens. */
  socialsMissing: boolean;
};

const NO_KIT = (influencer: Influencer): PartnerKit => ({
  title: "Votre kit de bienvenue",
  text: "",
  items: [],
  offered: false,
  prototype: false,
  order: null,
  socialsMissing: socialCount(influencer.socials) === 0,
});

export async function partnerKitSnapshot(influencer: Influencer, campaign: Campaign | null): Promise<PartnerKit> {
  if (!campaign) return NO_KIT(influencer);
  const [products, order] = await Promise.all([listAllProducts(), findKitOrder(influencer.id, campaign.seq)]);
  const kit = campaign.kit;
  const items = kitItems(kit, products);
  return { title: kit.title, text: kit.text, items, offered: kitOffered(kit, items), prototype: kit.prototype, order, socialsMissing: socialCount(influencer.socials) === 0 };
}

/*
 * Une campagne telle que le partenaire la voit : ce qui a été convenu, et le contrat
 * accepté s'il y en a un. Les campagnes terminées restent de la partie — c'est là qu'il
 * retrouve ce qu'il avait signé l'an dernier.
 */
export type PartnerCollaboration = { campaign: Campaign; signature: ContractSignature | null };

/*
 * La campagne à laquelle il a affaire aujourd'hui : celle qui est en cours, sinon la
 * dernière ouverte. Terminée ou annulée, une campagne ne propose plus rien.
 */
export const liveCampaign = (list: Campaign[]): Campaign | null =>
  list.find((c) => c.status === "active") ?? list.find((c) => c.status === "draft") ?? null;

/*
 * Tout ce que l'espace partenaire affiche, en une lecture. L'horloge est lue ici et
 * non dans la page : un composant serveur doit rester pur (react-hooks/purity), et
 * c'est déjà la règle ailleurs — adminSnapshot() renvoie son `now` de la même façon.
 */
export async function partnerSnapshot(
  influencer: Influencer,
  period: PartnerPeriod,
): Promise<{ now: number; view: PartnerView; statements: StatementRow[]; kit: PartnerKit; campaign: Campaign | null; collaborations: PartnerCollaboration[] }> {
  const at = now();
  const since = periodStart(period, at);
  const sinceDay = new Date(since ?? influencer.createdAt).toISOString().slice(0, 10);
  const [orders, clicks, stored, campaigns] = await Promise.all([
    listOrders({ limit: 2000 }),
    listRefClicksSince(sinceDay).catch(() => []),
    influencer.commission ? listStatements(influencer.id) : Promise.resolve([]),
    listCampaigns(influencer.id),
  ]);
  const campaign = liveCampaign(campaigns);
  const [kit, collaborations] = await Promise.all([
    partnerKitSnapshot(influencer, campaign),
    /* Chaque campagne avec sa signature : une campagne sans contrat en a simplement pas. */
    Promise.all(campaigns.map(async (c) => ({ campaign: c, signature: await getSignature(c.signatureId).catch(() => null) }))),
  ]);
  return {
    now: at,
    view: partnerView(influencer, orders, clicks, at, period),
    // Les relevés couvrent toute l'histoire, pas seulement la fenêtre choisie.
    statements: statementRows(influencer, orders, stored, at),
    kit,
    campaign,
    collaborations,
  };
}
