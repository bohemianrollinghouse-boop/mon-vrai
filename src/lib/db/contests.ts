import "server-only";
import { Contest, type ContestHost, type ContestWinner } from "@/lib/domain/types";
import { db } from "@/lib/firebase/admin";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Les concours : un lot mis en jeu, des dates, un tirage — seul ou avec d'autres
 * créateurs (voir le commentaire de `Contest` dans domain/types.ts).
 *
 * Les co-organisateurs et les gagnants vivent DANS le document, et non dans des
 * collections à part : un concours en compte une poignée, on ne les lit jamais sans lui,
 * et l'écran d'administration en a besoin d'un seul coup. Ce qui oblige en revanche à
 * les modifier en transaction — un partenaire déclare son gagnant depuis son espace
 * pendant qu'un autre en fait autant, et deux écritures du tableau entier se
 * réécriraient l'une l'autre.
 */

const contests = () => col("contests");

export type ContestInput = Omit<Contest, "id" | "createdAt" | "updatedAt" | "hostInfluencerIds"> & { id?: string };

export async function listContests(): Promise<Contest[]> {
  const list = await parseQuery(Contest, contests().limit(500));
  /* Le plus récent d'abord : on regarde ce qui court, pas ce qui est passé. */
  return list.sort((a, b) => b.startAt - a.startAt);
}

export async function getContest(id: string): Promise<Contest | null> {
  if (!id) return null;
  return parseDoc(Contest, await contests().doc(id).get());
}

export async function upsertContest(input: ContestInput): Promise<Contest> {
  const id = input.id || newId("cts");
  const existing = parseDoc(Contest, await contests().doc(id).get());
  const doc = Contest.parse({
    ...input,
    id,
    /* Déduit, jamais saisi : c'est la seule forme que Firestore sait interroger. */
    hostInfluencerIds: [...new Set(input.hosts.map((h) => h.influencerId).filter(Boolean))],
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  await contests().doc(id).set(doc);
  return doc;
}

export async function deleteContest(id: string): Promise<void> {
  await contests().doc(id).delete();
}

/*
 * Tous les concours où un partenaire figure, publiés ou non : ce que l'administration
 * lit sur sa fiche. La version qu'il voit, lui, est plus étroite — voir plus bas.
 */
export async function listContestsHostedBy(influencerId: string): Promise<Contest[]> {
  if (!influencerId) return [];
  const list = await parseQuery(Contest, contests().where("hostInfluencerIds", "array-contains", influencerId).limit(100));
  return list.sort((a, b) => b.startAt - a.startAt);
}

/*
 * Les concours qu'un partenaire voit dans son espace : ceux qu'il co-organise, et
 * publiés. Un concours en préparation ne se montre pas — on y travaille encore les
 * dates et le lot.
 *
 * Une exception, et une seule : CEUX QU'IL A MONTÉS LUI-MÊME. Sa proposition est encore
 * un brouillon pour nous, mais elle est déjà la sienne — la lui cacher jusqu'à notre
 * validation reviendrait à lui faire écrire dans le vide, et il ne pourrait plus la
 * corriger ni la retirer.
 */
export async function listContestsForInfluencer(influencerId: string): Promise<Contest[]> {
  if (!influencerId) return [];
  const list = await parseQuery(Contest, contests().where("hostInfluencerIds", "array-contains", influencerId).limit(100));
  return list.filter((c) => c.published || c.proposedBy === influencerId).sort((a, b) => b.startAt - a.startAt);
}

/*
 * Applique un changement au document entier, en transaction : le concours est relu, la
 * modification portée sur la version fraîche, et le tout réécrit. Rendre `null` annule
 * l'écriture — c'est ainsi qu'une règle métier (« les places sont prises ») refuse sans
 * avoir à lever.
 */
async function mutate(id: string, apply: (contest: Contest) => Contest | null): Promise<Contest | null> {
  return db().runTransaction(async (tx) => {
    const ref = contests().doc(id);
    const current = parseDoc(Contest, await tx.get(ref));
    if (!current) return null;
    const next = apply(current);
    if (!next) return null;
    const doc = Contest.parse({ ...next, hostInfluencerIds: [...new Set(next.hosts.map((h) => h.influencerId).filter(Boolean))], updatedAt: now() });
    tx.set(ref, doc);
    return doc;
  });
}

/*
 * Ce qu'un partenaire autonome réécrit de son propre concours, en transaction comme le
 * reste : il corrige ses dates pendant qu'un autre co-organisateur déclare un gagnant.
 *
 * La liste des champs EST la règle — le lot, la publication, les co-organisateurs et les
 * gagnants n'y figurent pas, et ne peuvent donc pas être touchés depuis son espace,
 * quoi que son formulaire poste.
 */
export type PartnerContestPatch = Pick<Contest, "name" | "platform" | "startAt" | "endAt" | "mechanic" | "rules">;

export async function savePartnerContest(contestId: string, influencerId: string, patch: PartnerContestPatch): Promise<Contest | null> {
  return mutate(contestId, (c) => (c.proposedBy === influencerId ? { ...c, ...patch } : null));
}

/*
 * Retire une proposition. Relu et effacé dans la MÊME transaction : entre une lecture et
 * une suppression séparées, un gagnant peut être déclaré — et le lot promis partirait
 * avec un concours qui n'existe plus.
 */
export async function deletePartnerContest(contestId: string, influencerId: string): Promise<boolean> {
  return db().runTransaction(async (tx) => {
    const ref = contests().doc(contestId);
    const current = parseDoc(Contest, await tx.get(ref));
    if (!current || current.proposedBy !== influencerId || current.published || current.winners.length > 0) return false;
    tx.delete(ref);
    return true;
  });
}

export type WinnerInput = Omit<ContestWinner, "id" | "declaredAt" | "orderId"> & { id?: string };

/*
 * Déclare un gagnant. Refusé quand les places sont prises : le nombre de gagnants est
 * celui des lots, et deux co-organisateurs qui tirent en même temps ne doivent pas en
 * faire un de plus. La relecture en transaction est tout l'intérêt.
 */
export async function addWinner(contestId: string, input: WinnerInput): Promise<{ contest: Contest; winner: ContestWinner } | null> {
  const winner: ContestWinner = { ...input, id: input.id || newId("win"), declaredAt: now(), orderId: "" };
  const contest = await mutate(contestId, (c) => (c.winners.length >= c.winnersWanted ? null : { ...c, winners: [...c.winners, winner] }));
  return contest ? { contest, winner } : null;
}

/** Corrige un gagnant : adresse complétée, nom corrigé, e-mail rattrapé. */
export async function updateWinner(contestId: string, winnerId: string, patch: Partial<Omit<ContestWinner, "id" | "declaredAt">>): Promise<Contest | null> {
  return mutate(contestId, (c) =>
    c.winners.some((w) => w.id === winnerId) ? { ...c, winners: c.winners.map((w) => (w.id === winnerId ? { ...w, ...patch } : w)) } : null,
  );
}

/** Retire un gagnant (mauvais tirage, gagnant injoignable). Le lot déjà expédié reste, lui. */
export async function removeWinner(contestId: string, winnerId: string): Promise<Contest | null> {
  return mutate(contestId, (c) => ({ ...c, winners: c.winners.filter((w) => w.id !== winnerId) }));
}

/** Ajoute des co-organisateurs, sans doublon : `id` vaut l'identifiant du partenaire. */
export async function addHosts(contestId: string, hosts: ContestHost[]): Promise<Contest | null> {
  return mutate(contestId, (c) => {
    const known = new Set(c.hosts.map((h) => h.id));
    return { ...c, hosts: [...c.hosts, ...hosts.filter((h) => !known.has(h.id))] };
  });
}

/*
 * Retire un co-organisateur. Ses gagnants le perdent de vue (`hostId` vidé) plutôt que
 * de disparaître avec lui : un lot promis reste dû, même si la collaboration a tourné
 * court.
 */
export async function removeHost(contestId: string, hostId: string): Promise<Contest | null> {
  return mutate(contestId, (c) => ({
    ...c,
    hosts: c.hosts.filter((h) => h.id !== hostId),
    winners: c.winners.map((w) => (w.hostId === hostId ? { ...w, hostId: "" } : w)),
  }));
}

/** Ce qu'un co-organisateur déclare de sa propre publication, depuis son espace. */
export async function saveHostReport(contestId: string, hostId: string, report: Pick<ContestHost, "postUrl" | "participants" | "followers">): Promise<Contest | null> {
  return mutate(contestId, (c) =>
    c.hosts.some((h) => h.id === hostId) ? { ...c, hosts: c.hosts.map((h) => (h.id === hostId ? { ...h, ...report } : h)) } : null,
  );
}
