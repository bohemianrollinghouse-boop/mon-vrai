import { publicationProgress, publicationSlots, type PublicationProgress, type PublicationSlot } from "@/lib/admin/publications";
import { quotaFor, shortfall, tallyContents, type ContentTally, type Shortfall } from "@/lib/domain/deliverables";
import { operationState, type OperationState } from "@/lib/promos/operation";
import type { Campaign, ContentQuota, Contract, Deliverable, Influencer, Operation, Order } from "@/lib/domain/types";

/*
 * Le suivi des campagnes en cours : qui en est où, et ce qu'il reste à obtenir.
 *
 * L'écran des campagnes disait ce qu'on avait organisé ; il ne disait pas ce qui
 * traînait. Or la question de tous les jours n'est pas « quelles campagnes ai-je
 * montées » mais « qu'est-ce qui m'attend » : un colis à confirmer, un réel qui n'est
 * jamais paru, des photos qui ne sont jamais arrivées. Ce fichier répond à celle-là.
 *
 * Rien ne s'y tient à jour : chaque étape se DÉDUIT de ce qui existe déjà — la
 * signature, la commande du kit et son statut, les parutions constatées, les fichiers
 * au dossier. Aucun état à maintenir, donc aucun qui puisse mentir ; c'est la règle des
 * campagnes partagées et des concours, appliquée au suivi.
 *
 * La distinction qui porte tout l'écran est celle du CAMP : une étape attend quelque
 * chose de NOUS (expédier, confirmer une réception, écrire une quantité, clore) ou
 * quelque chose d'EUX (signer, commander son kit, publier, envoyer ses fichiers). Les
 * premières seules appellent un geste aujourd'hui ; les secondes, au mieux une relance.
 *
 * Pur et testé, comme content-dues.ts : rien n'est lu ici, tout est donné.
 */

export type StepKey = "contract" | "kit" | "parcel" | "publications" | "contents";

/** `ours` : la balle est dans notre camp. `theirs` : on attend le partenaire. */
export type StepState = "done" | "ours" | "theirs" | "none";

export type BoardStep = {
  key: StepKey;
  label: string;
  state: StepState;
  /** Ce qu'il y a à en dire, en deux mots : « signé », « 2 sur 5 », « à confirmer ». */
  detail: string;
};

export const STEP_LABELS: Record<StepKey, string> = {
  contract: "Contrat",
  kit: "Kit",
  parcel: "Colis",
  publications: "Parutions",
  contents: "Contenus",
};

export type BoardRow = {
  campaign: Campaign;
  influencerId: string;
  influencerName: string;
  steps: BoardStep[];
  /** Ce qu'il reste, par ordre d'urgence : « Confirmer la réception », « 1 parution », « 12 photos ». */
  remaining: string[];
  /** La commande du kit, quand elle existe : c'est elle qui dit où en est le colis. */
  order: Order | null;
  /** Le colis existe et personne n'a dit qu'il était arrivé : à marquer d'ici. */
  confirmable: boolean;
  /** Les parutions dues, dépliées, pour les cocher sans quitter l'écran. */
  slots: PublicationSlot[];
  published: PublicationProgress;
  expected: ContentQuota;
  received: ContentTally;
  missing: Shortfall;
  /** Tout est fait : la campagne n'attend plus que d'être close. */
  closable: boolean;
  /** Close, et montrée quand même : clore doit se VOIR, sinon rien ne s'est passé. */
  closed: boolean;
  closedOn: number;
  /** Quelque chose dépend de nous — c'est ce qui fait remonter la ligne. */
  ours: boolean;
};

export type BoardGroup = {
  /** La campagne dont ces participations relèvent ; absente, elles ont été montées à part. */
  operation: Operation | null;
  state: OperationState | null;
  rows: BoardRow[];
  /** Plus rien n'y court : la campagne se replie alors sur une ligne d'histoire. */
  allClosed: boolean;
};

export type BoardTotals = {
  /** Campagnes partagées qui ont au moins une participation en cours. */
  operations: number;
  /** Participations en cours, toutes campagnes confondues. */
  running: number;
  /** Celles qui attendent un geste de nous. */
  ours: number;
  /** Celles où l'on attend le partenaire. */
  theirs: number;
  /** Celles dont tout est fait : il ne reste qu'à les clore. */
  closable: number;
  /** Celles qui sont closes : ce qu'on vient de solder, et qui doit se voir. */
  closed: number;
};

const count = (n: number, one: string) => `${n} ${one}${n > 1 ? "s" : ""}`;

/*
 * L'ordre de lecture est l'ordre de l'urgence. Ce qui ne tient plus qu'à un clic
 * d'abord, puis ce qui dépend de nous — le seul endroit où personne ne peut avancer à
 * notre place —, puis ce qu'on attend d'eux, du plus en retard au moins.
 */
const rank = (r: BoardRow): number => (r.closed ? 4 : r.closable ? 0 : r.ours ? 1 : r.remaining.length > 0 ? 2 : 3);

/** Ce qu'une ligne a encore à produire, tous postes confondus : sert à départager. */
const owed = (r: BoardRow): number => (r.published.required ? r.published.total - r.published.done : 0) + r.missing.total;

const step = (key: StepKey, state: StepState, detail: string): BoardStep => ({ key, label: STEP_LABELS[key], state, detail });

function stepsOf(input: {
  campaign: Campaign;
  order: Order | null;
  published: PublicationProgress;
  missing: Shortfall;
  received: ContentTally;
  expected: ContentQuota;
}): BoardStep[] {
  const { campaign, order, published, missing, received, expected } = input;

  /* Le contrat : signé ou non. Sans contrat, rien à signer — et rien à dire. */
  const contract = !campaign.contractId
    ? step("contract", "none", "sans contrat")
    : campaign.signatureId
      ? step("contract", "done", "signé")
      : step("contract", "theirs", "à signer");

  /* Le kit : c'est le partenaire qui le commande, depuis son espace. */
  const kit = !campaign.kit.enabled
    ? step("kit", "none", "sans kit")
    : campaign.kitOrderId
      ? step("kit", "done", "commandé")
      : step("kit", "theirs", "à commander");

  /*
   * Le colis. Tant qu'il n'est pas parti, c'est nous qu'il attend ; parti, il attend
   * qu'on dise qu'il est arrivé — Boxtal le dit de lui-même quand il y a un suivi, et
   * personne quand il n'y en a pas. D'où le geste à faire ici.
   */
  const parcel = !order
    ? step("parcel", "none", "")
    : order.status === "cancelled" || order.status === "refunded"
      ? step("parcel", "none", "annulé")
      : order.status === "delivered"
        ? step("parcel", "done", "reçu")
        : order.status === "shipped"
          ? step("parcel", "ours", "à confirmer")
          : step("parcel", "ours", "à expédier");

  /*
   * Les parutions. Tout est paru mais il manque des liens : la parution est faite, pas
   * le dossier — et c'est à nous d'aller les chercher, puisque c'est nous qui les
   * gardons.
   */
  const publications = !published.required
    ? step("publications", "none", "rien d'exigé")
    : published.complete
      ? published.withoutUrl > 0
        ? step("publications", "ours", `${count(published.withoutUrl, "lien")} à récupérer`)
        : step("publications", "done", "tout est paru")
      : step("publications", "theirs", `${published.done} sur ${published.total}`);

  /*
   * Les contenus. Une campagne sous contrat dont personne n'a jamais écrit la quantité
   * attendue n'attend rien du partenaire : elle attend qu'on l'écrive, sur le contrat.
   */
  const total = received.photos + received.videos;
  const contents = !missing.agreed
    ? campaign.contractId
      ? step("contents", "ours", "quantité à écrire")
      : step("contents", "none", "rien d'attendu")
    : missing.done
      ? step("contents", "done", `${total} reçus`)
      : step("contents", "theirs", `${total} sur ${expected.photos + expected.videos}`);

  return [contract, kit, parcel, publications, contents];
}

/** Ce qu'il reste à obtenir, dit comme on le dirait à voix haute. */
function remainingOf(steps: BoardStep[], published: PublicationProgress, missing: Shortfall): string[] {
  const by = (key: StepKey) => steps.find((s) => s.key === key);
  const out: string[] = [];

  if (by("parcel")?.detail === "à expédier") out.push("Expédier le kit");
  if (by("parcel")?.detail === "à confirmer") out.push("Confirmer la réception");
  if (by("contract")?.state === "theirs") out.push("Contrat à signer");
  if (by("kit")?.state === "theirs") out.push("Kit à commander");
  if (published.required && !published.complete) out.push(count(published.total - published.done, "parution"));
  if (published.complete && published.withoutUrl > 0) out.push(`${count(published.withoutUrl, "lien")} à récupérer`);
  if (by("contents")?.state === "ours") out.push("Quantité à écrire au contrat");
  if (missing.photos > 0) out.push(count(missing.photos, "photo"));
  if (missing.videos > 0) out.push(count(missing.videos, "vidéo"));
  return out;
}

export function campaignBoard(input: {
  operations: Operation[];
  campaigns: Campaign[];
  influencers: Influencer[];
  contracts: Contract[];
  /** Les commandes de kit, par leur identifiant : seules celles-là sont regardées. */
  orders: Order[];
  deliverables: Deliverable[];
  now: number;
}): { groups: BoardGroup[]; totals: BoardTotals } {
  const contractById = new Map(input.contracts.map((c) => [c.id, c]));
  const nameById = new Map(input.influencers.map((i) => [i.id, i.name]));
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  const operationById = new Map(input.operations.map((o) => [o.id, o]));

  const byCampaign = new Map<string, Deliverable[]>();
  for (const d of input.deliverables) {
    const list = byCampaign.get(d.campaignId);
    if (list) list.push(d);
    else byCampaign.set(d.campaignId, [d]);
  }

  const rows: BoardRow[] = [];
  for (const campaign of input.campaigns) {
    /*
     * Une campagne ANNULÉE sort du suivi : la contrepartie n'a jamais été remise, il n'y
     * a rien à en attendre ni à en constater. Une campagne CLOSE y reste, en revanche,
     * et c'est délibéré : la faire disparaître au clic, c'était rendre la clôture
     * invisible — on cliquait, la ligne s'évaporait, et rien ne disait que quelque chose
     * avait eu lieu. Elle descend au bas de son groupe, en gris, avec sa date.
     */
    if (campaign.status === "cancelled") continue;

    const contract = contractById.get(campaign.contractId);
    const expected = quotaFor(campaign.expected, contract?.expected);
    const received = tallyContents(byCampaign.get(campaign.id) ?? []);
    const missing = shortfall(expected, received);
    const slots = publicationSlots(contract?.publications ?? [], campaign.publications);
    const published = publicationProgress(slots);
    const order = orderById.get(campaign.kitOrderId) ?? null;

    const steps = stepsOf({ campaign, order, published, missing, received, expected });
    const closed = campaign.status === "completed";
    rows.push({
      campaign,
      influencerId: campaign.influencerId,
      influencerName: nameById.get(campaign.influencerId) ?? "Partenaire retiré",
      steps,
      remaining: remainingOf(steps, published, missing),
      order,
      confirmable: order !== null && order.status !== "delivered" && order.status !== "cancelled" && order.status !== "refunded",
      slots,
      published,
      expected,
      received,
      missing,
      /* On ne propose de clore que ce qui ne doit plus rien, d'aucun des deux côtés. */
      closable: campaign.status === "active" && steps.every((s) => s.state === "done" || s.state === "none"),
      closed,
      closedOn: closed ? campaign.completedAt ?? campaign.updatedAt : 0,
      /* Close, elle n'attend plus rien de nous : le sable est réservé à ce qui reste à faire. */
      ours: !closed && steps.some((s) => s.state === "ours"),
    });
  }

  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      owed(b) - owed(a) ||
      a.influencerName.localeCompare(b.influencerName, "fr") ||
      b.campaign.seq - a.campaign.seq,
  );

  /*
   * Regroupées par campagne, et pas autrement : la question posée est « où en est ma
   * campagne d'automne ». Une participation montée pour quelqu'un seul — ou dont la
   * campagne a été supprimée depuis — se range à part, à la fin : elle existe, elle
   * attend quelque chose, et la cacher reviendrait à l'oublier.
   */
  const grouped = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const key = operationById.has(row.campaign.operationId) ? row.campaign.operationId : "";
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }

  const groups: BoardGroup[] = [...grouped].map(([key, list]) => {
    const operation = key ? operationById.get(key) ?? null : null;
    return {
      operation,
      state: operation ? operationState(operation, input.now) : null,
      rows: list,
      allClosed: list.every((r) => r.closed),
    };
  });

  /*
   * Les campagnes qui courent d'abord, puis celles qui attendent leur date, puis celles
   * dont la date est passée alors que des participations traînent encore — ce sont
   * précisément celles-là qu'il faut solder. Le hors-campagne ferme la marche.
   */
  const stateRank: Record<OperationState, number> = { live: 0, upcoming: 1, over: 2 };
  groups.sort((a, b) => {
    if (!a.operation || !a.state) return 1;
    if (!b.operation || !b.state) return -1;
    return stateRank[a.state] - stateRank[b.state] || a.operation.endAt - b.operation.endAt || a.operation.name.localeCompare(b.operation.name, "fr");
  });

  return {
    groups,
    totals: {
      operations: groups.filter((g) => g.operation).length,
      running: rows.filter((r) => !r.closed).length,
      ours: rows.filter((r) => r.ours).length,
      theirs: rows.filter((r) => !r.closed && !r.ours && r.remaining.length > 0).length,
      closable: rows.filter((r) => r.closable).length,
      closed: rows.filter((r) => r.closed).length,
    },
  };
}
