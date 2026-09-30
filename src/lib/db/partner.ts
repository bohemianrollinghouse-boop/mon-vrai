import "server-only";
import { findKitOrder, listOrders } from "./orders";
import { listRefClicksSince } from "./promos";
import { listCampaigns } from "./campaigns";
import { listContestsForInfluencer } from "./contests";
import { getSignature } from "./contracts";
import { partnerView, periodStart, type PartnerPeriod, type PartnerView } from "@/lib/promos/partner";
import { statementRows, type StatementRow } from "@/lib/promos/statements";
import { listStatements } from "./statements";
import { listAllProducts } from "./products";
import { kitItems, kitOffered, type KitItem } from "@/lib/promos/kit";
import { CONTEST_STATE_LABELS, contestState, partnerCanDelete, partnerCanEdit, seatsLeft, winnersOf, type ContestState } from "@/lib/contests/state";
import { socialCount } from "@/lib/promos/socials";
import { CONTEST_PLATFORM_LABELS, type Campaign, type ContractSignature, type Influencer, type Order } from "@/lib/domain/types";
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
 * Un concours tel que le co-organisateur le voit : ce qui est convenu, ce qu'il a
 * déclaré, et ce qu'il peut encore faire. Tout est préparé ici plutôt que dans la page —
 * l'espace partenaire n'a pas à connaître la forme d'un `Contest`, ni à refaire les
 * calculs de `lib/contests/state.ts`.
 *
 * Ne remontent que les concours PUBLIÉS où il figure comme partenaire (voir
 * `listContestsForInfluencer`) : un jeu en préparation ne se montre pas.
 */
export type PartnerContest = {
  id: string;
  name: string;
  platform: string;
  startAt: number;
  endAt: number;
  state: ContestState;
  stateLabel: string;
  mechanic: string;
  rules: string;
  prize: { items: { slug: string; title: string; qty: number; image?: string }[]; extra: string };
  winnersWanted: number;
  /** Places restantes, communes à tous les co-organisateurs : les lots ne se dédoublent pas. */
  seatsLeft: number;
  /** Le tirage est ouvert : le concours a commencé et il reste un lot à attribuer. */
  canDeclare: boolean;
  /** Les gagnants qu'il a lui-même déclarés. */
  mine: { id: string; handle: string; name: string; sent: boolean }[];
  /** Ce qu'il a déclaré de sa propre publication. */
  report: { postUrl: string; participants: number; followers: number };
  /*
   * Ce concours est de lui : il l'a monté depuis son espace. Un concours proposé mais
   * pas encore publié n'est visible que de lui et de nous — d'où `awaiting`, qui le dit
   * en toutes lettres plutôt que d'afficher un « Brouillon » qu'il ne saurait pas lire.
   */
  own: boolean;
  awaiting: boolean;
  /** Les dates et la mécanique se corrigent encore ; la proposition se retire encore. */
  canEdit: boolean;
  canDelete: boolean;
  /** Ce qu'un formulaire de correction doit réafficher, dans la forme d'un `<input type="date">`. */
  form: { platform: string; startDay: string; endDay: string };
};

const dayInput = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export async function partnerContests(influencer: Influencer, at: number): Promise<PartnerContest[]> {
  const [contests, products] = await Promise.all([listContestsForInfluencer(influencer.id).catch(() => []), listAllProducts()]);
  return contests.map((c) => {
    /* L'identifiant du co-organisateur EST celui du partenaire (voir actions/contests.ts). */
    const host = c.hosts.find((h) => h.influencerId === influencer.id);
    const state = contestState(c, at);
    const left = seatsLeft(c);
    return {
      id: c.id,
      name: c.name,
      platform: CONTEST_PLATFORM_LABELS[c.platform],
      startAt: c.startAt,
      endAt: c.endAt,
      state,
      stateLabel: CONTEST_STATE_LABELS[state],
      mechanic: c.mechanic,
      rules: c.rules,
      prize: { items: kitItems(c.prize, products).map((i) => ({ slug: i.slug, title: i.title, qty: i.qty, image: i.image?.url })), extra: c.prize.extra },
      winnersWanted: c.winnersWanted,
      seatsLeft: left,
      /* Publié d'abord : une proposition en attente n'a pas de lot, donc rien à donner. */
      canDeclare: c.published && c.startAt <= at && left > 0,
      mine: winnersOf(c, host?.id ?? "").map((w) => ({ id: w.id, handle: w.handle, name: w.name, sent: Boolean(w.orderId) })),
      report: { postUrl: host?.postUrl ?? "", participants: host?.participants ?? 0, followers: host?.followers ?? 0 },
      own: c.proposedBy === influencer.id,
      awaiting: c.proposedBy === influencer.id && !c.published,
      canEdit: partnerCanEdit(c, influencer.id, at),
      canDelete: partnerCanDelete(c, influencer.id),
      /* La plateforme brute, et non son intitulé : c'est la valeur que le <select> repose. */
      form: { platform: c.platform, startDay: dayInput(c.startAt), endDay: dayInput(c.endAt) },
    };
  });
}

/*
 * Tout ce que l'espace partenaire affiche, en une lecture. L'horloge est lue ici et
 * non dans la page : un composant serveur doit rester pur (react-hooks/purity), et
 * c'est déjà la règle ailleurs — adminSnapshot() renvoie son `now` de la même façon.
 */
export async function partnerSnapshot(
  influencer: Influencer,
  period: PartnerPeriod,
): Promise<{ now: number; view: PartnerView; statements: StatementRow[]; kit: PartnerKit; campaign: Campaign | null; collaborations: PartnerCollaboration[]; contests: PartnerContest[] }> {
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
  const [kit, collaborations, contests] = await Promise.all([
    partnerKitSnapshot(influencer, campaign),
    /* Chaque campagne avec sa signature : une campagne sans contrat en a simplement pas. */
    Promise.all(campaigns.map(async (c) => ({ campaign: c, signature: await getSignature(c.signatureId).catch(() => null) }))),
    partnerContests(influencer, at),
  ]);
  return {
    now: at,
    view: partnerView(influencer, orders, clicks, at, period),
    // Les relevés couvrent toute l'histoire, pas seulement la fenêtre choisie.
    statements: statementRows(influencer, orders, stored, at),
    kit,
    campaign,
    collaborations,
    contests,
  };
}
