/*
 * La version suivante d'un contrat : « UGC-2026-09-v1 » → « UGC-2026-09-v2 ».
 *
 * Un contrat signé ne se réécrit jamais en place — la signature en garde une copie
 * figée, et la version identifie ce qui a été accepté. Changer ce qu'on réclame veut
 * donc dire créer une version, pas corriger la précédente ; c'est seulement que
 * personne ne va retaper vingt articles pour deux chiffres. D'où la reprise, et d'où ce
 * calcul, qui n'a qu'un travail : proposer un numéro qui ne soit pas déjà pris.
 *
 * Une proposition, et jamais une imposition : le champ reste modifiable, et c'est
 * l'action qui vérifie l'unicité au moment d'enregistrer.
 */
export function nextVersion(version: string, taken: string[] = []): string {
  const known = new Set(taken.map((v) => v.trim().toLowerCase()));
  const base = version.trim() || "v1";
  /* Le suffixe « -v<n> » s'il y en a un ; sinon on le pose, en repartant de 1. */
  const found = base.match(/^(.*?)(?:[-_\s]?v)(\d+)$/i);
  const root = found ? found[1].replace(/[-_\s]+$/, "") : base;
  let n = found ? Number(found[2]) : 1;
  let candidate = "";
  do {
    n += 1;
    candidate = root ? `${root}-v${n}` : `v${n}`;
  } while (known.has(candidate.toLowerCase()) && n < 99);
  return candidate;
}
