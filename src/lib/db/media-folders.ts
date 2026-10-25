import type { Media } from "@/lib/domain/types";

/*
 * Les dossiers de la médiathèque se DÉDUISENT des fichiers : il n'y a pas de liste à
 * tenir, donc aucun dossier vide qui traîne, et aucun à créer avant d'y ranger quoi que
 * ce soit. Un partenaire dont on efface tous les contenus voit son dossier disparaître
 * tout seul — c'est la règle du projet : un état qu'on ne maintient pas ne peut pas
 * mentir.
 *
 * Pur, et hors de `db/` pour cette raison : `server-only` lève sous Node nu, et ceci se
 * teste à sec.
 */

/** Les dossiers existants, avec ce qu'ils contiennent. Le fonds commun n'en est pas un. */
export function mediaFolders(list: Media[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of list) {
    if (!m.folder) continue;
    counts.set(m.folder, (counts.get(m.folder) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
