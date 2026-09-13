/*
 * Retire les cadratins (—) des contrats déjà installés.
 *
 * Un tiret long se lit mal dans un contrat : entre un numéro d'article et son intitulé,
 * il tient la place de deux points, et à l'écran on le confond avec une rubrique laissée
 * vide. Les fichiers de `content/contracts/` sont déjà corrigés ; ce script applique les
 * mêmes règles aux contrats en base, que le seed ne réécrit jamais (une version identifie
 * ce qui a été signé).
 *
 * Les signatures ne bougent pas : chacune garde sa copie figée du texte accepté. Ce qui
 * change ici ne vaut que pour les signatures à venir.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/fix-contract-dashes.ts [--apply]
 */
import { listContracts, upsertContract } from "@/lib/db/contracts";

const APPLY = process.argv.includes("--apply");

/*
 * Trois règles, dans cet ordre :
 *   « ## Article 4 — Contenus »        → « ## Article 4 : Contenus »
 *   « Bohemian Rolling House — Mon Vrai » → « Bohemian Rolling House (Mon Vrai) »
 *   « Création de contenu UGC — Mon Vrai » → « Création de contenu UGC (Mon Vrai) »
 */
export function undash(text: string): string {
  return text
    .replace(/^(#{1,6} .*?) — /gm, "$1 : ")
    .replace(/Bohemian Rolling House — Mon Vrai/g, "Bohemian Rolling House (Mon Vrai)")
    .replace(/ — Mon Vrai\b/g, " (Mon Vrai)");
}

/** Ce qui resterait, une fois les règles passées : pour ne rien laisser sans le voir. */
const leftovers = (text: string) =>
  text
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter((l) => l.line.includes("—"));

async function main() {
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  for (const contract of await listContracts()) {
    const name = undash(contract.name);
    const summary = undash(contract.summary);
    const body = undash(contract.body);
    const before = [contract.name, contract.summary, contract.body].join("\n").split("—").length - 1;
    const after = [name, summary, body].join("\n").split("—").length - 1;

    if (before === 0) {
      console.log(`= ${contract.version.padEnd(22)} aucun cadratin`);
      continue;
    }
    console.log(`~ ${contract.version.padEnd(22)} ${before} cadratin(s) → ${after}`);
    if (contract.name !== name) console.log(`    nom : « ${contract.name} » → « ${name} »`);
    for (const l of leftovers(body)) console.log(`    RESTE ligne ${l.n} : ${l.line.slice(0, 100)}`);

    if (!APPLY) continue;
    /* Même version : le texte est corrigé, pas refondu. Les signatures gardent leur copie. */
    await upsertContract({ ...contract, name, summary, body });
  }

  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
