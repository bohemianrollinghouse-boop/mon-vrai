import { quotaFor, shortfall, tallyContents, type ContentTally, type Shortfall } from "@/lib/domain/deliverables";
import type { Campaign, ContentQuota, Contract, Deliverable, Influencer } from "@/lib/domain/types";

/*
 * Ce que les partenaires nous doivent encore, toutes campagnes confondues.
 *
 * La question est « qui dois-je relancer, et de combien ? », et elle ne se pose pas
 * campagne par campagne : il faut les voir ensemble pour savoir par où commencer. La
 * fiche d'un partenaire répond déjà pour LUI ; ceci répond pour tout le monde.
 *
 * Pur et testé, comme influence-stock.ts : rien n'est lu ici, tout est donné. La page
 * fait les quatre lectures et laisse ce fichier dire ce qu'elles signifient.
 */

export type ContentDue = {
  campaign: Campaign;
  influencerId: string;
  influencerName: string;
  /** Le contrat signé, par son nom — vide s'il a été retiré ou qu'il n'y en a pas. */
  contractName: string;
  expected: ContentQuota;
  received: ContentTally;
  missing: Shortfall;
};

export type ContentDuesTotals = {
  /** Campagnes où il manque quelque chose : celles à relancer. */
  late: number;
  /** Campagnes sous contrat dont personne n'a encore dit ce qu'elles attendent. */
  toFill: number;
  missingPhotos: number;
  missingVideos: number;
  expectedPhotos: number;
  expectedVideos: number;
  receivedPhotos: number;
  receivedVideos: number;
};

/*
 * L'ordre de lecture est l'ordre de l'urgence : ce qui manque le plus d'abord, puis ce
 * qu'il reste à renseigner — une campagne sous contrat dont on n'a pas dit la quantité
 * ne manque de rien tant qu'on ne l'a pas écrite, et c'est précisément ce qu'il faut
 * voir —, puis ce qui est complet, qui n'appelle plus rien.
 */
const rank = (s: Shortfall): number => (s.agreed && !s.done ? 0 : s.agreed ? 2 : 1);

export function contentDues(input: {
  campaigns: Campaign[];
  contracts: Contract[];
  influencers: Influencer[];
  deliverables: Deliverable[];
}): { rows: ContentDue[]; totals: ContentDuesTotals } {
  const contractById = new Map(input.contracts.map((c) => [c.id, c]));
  const nameById = new Map(input.influencers.map((i) => [i.id, i.name]));

  const byCampaign = new Map<string, Deliverable[]>();
  for (const d of input.deliverables) {
    const list = byCampaign.get(d.campaignId);
    if (list) list.push(d);
    else byCampaign.set(d.campaignId, [d]);
  }

  const rows: ContentDue[] = [];
  for (const campaign of input.campaigns) {
    /* Une campagne annulée ne doit plus rien : la contrepartie n'a jamais été remise. */
    if (campaign.status === "cancelled") continue;
    const contract = contractById.get(campaign.contractId);
    const expected = quotaFor(campaign.expected, contract?.expected);
    /* Sans contrat ni quantité, il n'y a rien à attendre — et donc rien à montrer : la
       liste ne doit pas se remplir de campagnes qui ne réclament rien. */
    if (expected.photos + expected.videos === 0 && !campaign.contractId) continue;

    const received = tallyContents(byCampaign.get(campaign.id) ?? []);
    rows.push({
      campaign,
      influencerId: campaign.influencerId,
      influencerName: nameById.get(campaign.influencerId) ?? "Partenaire retiré",
      contractName: contract?.name ?? "",
      expected,
      received,
      missing: shortfall(expected, received),
    });
  }

  rows.sort(
    (a, b) =>
      rank(a.missing) - rank(b.missing) ||
      b.missing.total - a.missing.total ||
      a.influencerName.localeCompare(b.influencerName, "fr") ||
      b.campaign.seq - a.campaign.seq,
  );

  const sum = (f: (r: ContentDue) => number) => rows.reduce((n, r) => n + f(r), 0);
  return {
    rows,
    totals: {
      late: rows.filter((r) => r.missing.agreed && !r.missing.done).length,
      toFill: rows.filter((r) => !r.missing.agreed).length,
      missingPhotos: sum((r) => r.missing.photos),
      missingVideos: sum((r) => r.missing.videos),
      expectedPhotos: sum((r) => r.expected.photos),
      expectedVideos: sum((r) => r.expected.videos),
      /* Ce qui est arrivé, plafonné à ce qui était demandé : le « 42 sur 40 » d'un
         partenaire généreux ne doit pas combler le retard d'un autre dans le total. */
      receivedPhotos: sum((r) => Math.min(r.received.photos, r.expected.photos)),
      receivedVideos: sum((r) => Math.min(r.received.videos, r.expected.videos)),
    },
  };
}
