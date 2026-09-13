/*
 * Traduit les variables des contrats déjà en base : les noms anglais deviennent leurs
 * équivalents français, dans le texte comme dans les valeurs enregistrées — y compris
 * les réglages propres à chaque partenaire.
 *
 * Sans effet sur les contrats déjà SIGNÉS : une signature garde sa copie figée, texte
 * remplacé, et ne contient plus aucune variable.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/migrate-contract-variables.ts [--apply]
 */
import { listContracts, upsertContract } from "@/lib/db/contracts";
import { listInfluencers, upsertInfluencer } from "@/lib/db/promos";
import { LEGACY_NAMES } from "@/lib/promos/contract-variables";

const APPLY = process.argv.includes("--apply");

const translate = (text: string) =>
  Object.entries(LEGACY_NAMES).reduce((acc, [old, next]) => acc.split(`{{${old}}}`).join(`{{${next}}}`), text);

const rename = (map: Record<string, string>) => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) out[LEGACY_NAMES[key] ?? key] = value;
  return out;
};

async function main() {
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  for (const c of await listContracts()) {
    const summary = translate(c.summary);
    const body = translate(c.body);
    const variables = rename(c.variables);
    const requiredVariables = c.requiredVariables.map((k) => LEGACY_NAMES[k] ?? k);
    const changed = summary !== c.summary || body !== c.body || JSON.stringify(variables) !== JSON.stringify(c.variables);
    console.log(`${changed ? "~" : "="} ${c.version.padEnd(24)} ${changed ? "à traduire" : "déjà en français"}`);
    if (changed && APPLY) await upsertContract({ ...c, summary, body, variables, requiredVariables });
  }

  for (const inf of await listInfluencers()) {
    const next = rename(inf.contractVariables);
    if (JSON.stringify(next) === JSON.stringify(inf.contractVariables)) continue;
    console.log(`~ ${inf.name.padEnd(24)} réglages de contrat traduits`);
    if (APPLY) await upsertInfluencer({ ...inf, contractVariables: next });
  }

  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
