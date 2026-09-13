/*
 * Installe les contrats de collaboration rédigés dans `content/contracts/`.
 *
 * Chaque fichier contient le résumé, une ligne `---` seule, puis le contrat intégral.
 * Le script ne touche pas à un contrat déjà présent sous la même version : une version
 * identifie ce qui a été signé et ne doit jamais changer de contenu. Pour corriger un
 * texte, on publie une nouvelle version.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/seed-contracts.ts [--apply]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listContracts, upsertContract } from "@/lib/db/contracts";
import type { CollaborationType } from "@/lib/domain/types";

const APPLY = process.argv.includes("--apply");
/* Remet les valeurs par défaut des variables sur un contrat déjà installé, sans toucher
   à son texte. Sans effet sur ce qui est déjà signé : la signature en garde sa copie. */
const VARIABLES = process.argv.includes("--variables");

/*
 * Valeurs de départ des variables de campagne. Elles ne créent aucun engagement que le
 * texte ne prévoie déjà : « aucune exclusivité », « publicité non comprise »… Sans
 * elles, le contrat s'affiche criblé de tirets, ce qui le fait paraître inachevé.
 * À relire et à ajuster dans l'admin pour chaque campagne.
 */
const COMMON: Record<string, string> = {
  NOTES_PROTOTYPES: "Aucune information particulière.",
  AUTORISATION_PUBLICITE_PAYANTE: "Non comprise. Toute utilisation publicitaire fera l'objet d'un accord complémentaire entre les Parties.",
  CONDITIONS_EXCLUSIVITE: "Aucune",
  DELAI_ENVOI_STATISTIQUES: "15 jours après la publication",
};

const FILES: { file: string; name: string; type: CollaborationType; version: string; variables: Record<string, string> }[] = [
  {
    file: "ugc.md",
    name: "Création de contenu UGC (Mon Vrai)",
    type: "UGC",
    version: "UGC-2026-09-v1",
    variables: { ...COMMON, DELAI_EN_JOURS: "30" },
  },
  {
    file: "influence.md",
    name: "Collaboration Influence (Mon Vrai)",
    type: "INFLUENCE",
    version: "INFLUENCE-2026-09-v1",
    variables: {
      ...COMMON,
      PLATEFORMES_DE_PUBLICATION: "Instagram et TikTok",
      DELAI_PUBLICATION_EN_JOURS: "30",
      DROITS_SUPPLEMENTAIRES: "Aucun droit supplémentaire accordé.",
    },
  },
  {
    file: "mixte.md",
    name: "Collaboration mixte UGC + Influence (Mon Vrai)",
    type: "MIXTE",
    version: "MIXTE-2026-09-v1",
    variables: {
      ...COMMON,
      PLATEFORMES_DE_PUBLICATION: "Instagram et TikTok",
      DELAI_EN_JOURS: "30",
      QUANTITE_UGC_CONVENUE: "Aucune quantité minimale convenue.",
      DROITS_SUPPLEMENTAIRES_INFLUENCE: "Aucun droit supplémentaire accordé.",
    },
  },
];

/* Le résumé et le contrat sont séparés par une ligne `---` seule sur sa ligne. */
function split(text: string): { summary: string; body: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => l.trim() === "---");
  if (at === -1) return { summary: "", body: text.trim() };
  return { summary: lines.slice(0, at).join("\n").trim(), body: lines.slice(at + 1).join("\n").trim() };
}

async function main() {
  const dir = path.join(process.cwd(), "content", "contracts");
  const existing = await listContracts();
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  for (const entry of FILES) {
    const { summary, body } = split(await readFile(path.join(dir, entry.file), "utf-8"));
    const already = existing.find((c) => c.version.toLowerCase() === entry.version.toLowerCase());
    if (already) {
      if (!VARIABLES) {
        console.log(`= ${entry.version.padEnd(24)} déjà installé (${already.id})`);
        continue;
      }
      const missing = Object.entries(entry.variables).filter(([k]) => !already.variables[k]?.trim());
      if (missing.length === 0) {
        console.log(`= ${entry.version.padEnd(24)} variables déjà renseignées`);
        continue;
      }
      console.log(`~ ${entry.version.padEnd(24)} ${missing.length} variable(s) à remplir : ${missing.map(([k]) => k).join(", ")}`);
      if (!APPLY) continue;
      await upsertContract({ ...already, variables: { ...entry.variables, ...already.variables } });
      continue;
    }
    console.log(`~ ${entry.version.padEnd(24)} ${entry.name} · résumé ${summary.length} c · contrat ${body.length} c`);
    if (!APPLY) continue;
    const saved = await upsertContract({ name: entry.name, type: entry.type, version: entry.version, summary, body, variables: entry.variables, requiredVariables: [], active: true });
    console.log(`  → ${saved.id}`);
  }

  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
