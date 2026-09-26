import type { Contest, ContestHost, ContestWinner } from "@/lib/domain/types";

/*
 * Ce qu'on sait dire d'un concours sans toucher à la base.
 *
 * Pur : l'administration, l'espace partenaire, les actions et les tests s'en servent
 * tous et doivent répondre la même chose — notamment sur « le tirage est-il fait ? »,
 * qui commande à la fois un badge et le droit d'un co-organisateur à déclarer encore
 * un gagnant.
 */

/*
 * L'état d'un concours se DÉDUIT : de sa publication, de ses dates, de ses gagnants et
 * de leurs lots expédiés. Il n'y a donc pas de statut à tenir à jour, donc pas de statut
 * qui puisse mentir — c'est déjà la règle des campagnes (lib/promos/operation.ts).
 *
 * « Tirage à faire » est le seul état qui appelle une action de notre part sans
 * qu'aucune date ne l'annonce : le concours est clos, les gagnants manquent.
 */
export type ContestState = "draft" | "upcoming" | "live" | "drawing" | "shipping" | "closed";

export const CONTEST_STATE_LABELS: Record<ContestState, string> = {
  draft: "Brouillon",
  upcoming: "À venir",
  live: "En cours",
  drawing: "Tirage à faire",
  shipping: "Lots à envoyer",
  closed: "Terminé",
};

export function contestState(contest: Contest, now: number): ContestState {
  if (!contest.published) return "draft";
  if (contest.startAt > now) return "upcoming";
  if (contest.endAt >= now) return "live";
  if (contest.winners.length < contest.winnersWanted) return "drawing";
  /* Un lot sans commande n'est pas parti : le concours n'est pas fini pour autant. */
  return contest.winners.every((w) => w.orderId) ? "closed" : "shipping";
}

/** Les états qui demandent quelque chose de nous : ce que compte le badge de la barre latérale. */
export const CONTEST_TODO: ContestState[] = ["drawing", "shipping"];

/** Monté avec d'autres créateurs, ou sur nos seuls réseaux. */
export const shared = (contest: Pick<Contest, "hosts">): boolean => contest.hosts.length > 0;

/** Les participants déclarés, les nôtres et les leurs. */
export const totalParticipants = (contest: Pick<Contest, "participants" | "hosts">): number =>
  contest.participants + contest.hosts.reduce((n, h) => n + h.participants, 0);

/** Le co-organisateur d'un gagnant, ou null quand il vient de nos propres réseaux. */
export const hostOf = (contest: Pick<Contest, "hosts">, winner: Pick<ContestWinner, "hostId">): ContestHost | null =>
  contest.hosts.find((h) => h.id === winner.hostId) ?? null;

/** Ce qu'un co-organisateur a déclaré, à lui seul. */
export const winnersOf = (contest: Pick<Contest, "winners">, hostId: string): ContestWinner[] =>
  contest.winners.filter((w) => w.hostId === hostId);

/*
 * Combien de gagnants un co-organisateur peut encore déclarer.
 *
 * Les places sont communes : un concours à trois gagnants monté à deux ne fait pas six
 * gagnants. Le premier qui déclare prend la place — c'est ce qui se passe dans la vraie
 * vie, où l'on s'accorde sur le nombre de lots et non sur leur répartition.
 */
export const seatsLeft = (contest: Pick<Contest, "winners" | "winnersWanted">): number =>
  Math.max(0, contest.winnersWanted - contest.winners.length);

/** Le lot se compose-t-il de quelque chose ? Des livres, ou une mention hors catalogue. */
export const prizeSaid = (prize: Pick<Contest["prize"], "lines" | "extra">): boolean => prize.lines.length > 0 || prize.extra.trim().length > 0;

/** Un gagnant est-il expédiable ? Il faut une adresse, un e-mail et des livres à mettre dans le colis. */
export const shippable = (winner: Pick<ContestWinner, "address" | "email" | "orderId">, books: number): boolean =>
  !winner.orderId && Boolean(winner.address) && Boolean(winner.email) && books > 0;
