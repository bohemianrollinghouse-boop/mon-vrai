/*
 * Lecture des rollouts App Hosting, côté pur : décider si une mise en ligne est en
 * cours. La liste que rend l'API n'est ni triée ni filtrable — `orderBy` est refusé et
 * `filter=state=…` ne renvoie jamais rien —, c'est donc ici, en choisissant le plus
 * récent, que se joue la justesse du bandeau. D'où un fichier à part, testable à sec
 * (le même partage que `boxtal/request.ts` et `boxtal/shipment.ts`).
 */

export type Rollout = { name?: string; state?: string; createTime?: string };

export type DeployStatus = {
  active: boolean;
  /** Début du rollout en cours, en millisecondes epoch. */
  since?: number;
  /** Son nom, tel qu'App Hosting le donne (« rollout-2026-09-12-003 »). */
  what?: string;
};

/* Tout ce qui n'est pas terminé compte comme « en cours » : une liste d'états finaux
   vieillit mieux qu'une liste d'états intermédiaires, qu'un nouvel état ferait rater. */
const DONE = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

/* Un rollout qui traîne depuis une demi-heure est bloqué, pas en cours : on cesse de
   faire tourner le bandeau plutôt que de mentir indéfiniment. */
const STALE_MS = 30 * 60_000;

export function rolloutStatus(rollouts: Rollout[], now: number): DeployStatus {
  let newest: Rollout | null = null;
  for (const r of rollouts) {
    if (!newest || (r.createTime ?? "") > (newest.createTime ?? "")) newest = r;
  }
  if (!newest) return { active: false };

  const since = newest.createTime ? new Date(newest.createTime).getTime() : NaN;
  const running = !DONE.has(newest.state ?? "") && (Number.isNaN(since) || now - since < STALE_MS);
  if (!running) return { active: false };
  return { active: true, since: Number.isNaN(since) ? undefined : since, what: newest.name?.split("/").pop() };
}
