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

const FILES: { file: string; name: string; type: CollaborationType; version: string }[] = [
  { file: "ugc.md", name: "Création de contenu UGC — Mon Vrai", type: "UGC", version: "UGC-2026-09-v1" },
  { file: "influence.md", name: "Collaboration Influence — Mon Vrai", type: "INFLUENCE", version: "INFLUENCE-2026-09-v1" },
  { file: "mixte.md", name: "Collaboration mixte UGC + Influence — Mon Vrai", type: "MIXTE", version: "MIXTE-2026-09-v1" },
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
      console.log(`= ${entry.version.padEnd(24)} déjà installé (${already.id})`);
      continue;
    }
    console.log(`~ ${entry.version.padEnd(24)} ${entry.name} · résumé ${summary.length} c · contrat ${body.length} c`);
    if (!APPLY) continue;
    const saved = await upsertContract({ name: entry.name, type: entry.type, version: entry.version, summary, body, variables: {}, active: true });
    console.log(`  → ${saved.id}`);
  }

  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
