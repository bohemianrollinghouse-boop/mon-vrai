/*
 * Transforme en CAMPAGNE ce qui vivait sur la fiche du partenaire.
 *
 * Le kit, le contrat, ses réglages, la commande et la signature décrivaient une
 * collaboration : ils appartiennent à une campagne, dont un partenaire peut avoir
 * plusieurs. On en fabrique une première, à l'identique, pour chaque partenaire qui
 * avait quelque chose à transporter.
 *
 * Idempotent : un partenaire qui a déjà une campagne est laissé tranquille.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/migrate-campaigns.ts [--apply]
 */
import { listCampaigns, upsertCampaign } from "@/lib/db/campaigns";
import { listInfluencers } from "@/lib/db/promos";
import { getSignature } from "@/lib/db/contracts";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  for (const inf of await listInfluencers()) {
    const existing = await listCampaigns(inf.id);
    if (existing.length > 0) {
      console.log(`= ${inf.name.padEnd(22)} ${existing.length} campagne(s) déjà en place`);
      continue;
    }
    const hasSomething = inf.kit.lines.length > 0 || inf.contractId || inf.kitOrderId || inf.signatureId;
    if (!hasSomething) {
      console.log(`· ${inf.name.padEnd(22)} rien à reprendre`);
      continue;
    }

    /* L'état se déduit de ce qui a déjà eu lieu : une signature en cours ou un kit
       déjà commandé font une campagne en cours ; sinon elle reste ouverte. */
    const signature = await getSignature(inf.signatureId).catch(() => null);
    const status = signature
      ? signature.state === "active"
        ? "active"
        : signature.state
      : inf.kitOrderId
        ? "active"
        : "draft";
    console.log(`~ ${inf.name.padEnd(22)} campagne n° 1 · ${status} · kit ${inf.kit.lines.length} titre(s)${inf.contractId ? " · contrat" : ""}`);
    if (!APPLY) continue;

    await upsertCampaign({
      influencerId: inf.id,
      seq: 1,
      name: "Première campagne",
      collaborationType: inf.collaborationType,
      contractId: inf.contractId,
      contractVariables: inf.contractVariables,
      kit: inf.kit,
      kitOrderId: inf.kitOrderId,
      signatureId: inf.signatureId,
      status,
    });
  }

  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
