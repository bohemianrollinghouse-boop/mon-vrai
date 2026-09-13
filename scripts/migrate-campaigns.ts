/*
 * Transforme en CAMPAGNE ce qui vivait sur la fiche du partenaire.
 *
 * Le kit, le contrat, ses réglages, la commande, la signature, le code promo et sa
 * remise décrivaient une collaboration : ils appartiennent à une campagne, dont un
 * partenaire peut avoir plusieurs. On en fabrique une première, à l'identique, pour
 * chaque partenaire qui avait quelque chose à transporter. Le document `promos/<code>`
 * est réécrit depuis la campagne — c'est elle, désormais, qui le fait vivre.
 *
 * Idempotent : un partenaire qui a déjà une campagne est laissé tranquille.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/migrate-campaigns.ts [--apply]
 */
import { listCampaigns, syncCampaignPromo, upsertCampaign } from "@/lib/db/campaigns";
import { listInfluencers } from "@/lib/db/promos";
import { getSignature } from "@/lib/db/contracts";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  for (const inf of await listInfluencers()) {
    const existing = await listCampaigns(inf.id);
    if (existing.length > 0) {
      /*
       * Campagnes déjà fabriquées par un premier passage, avant que le code promo et les
       * dates ne leur appartiennent : on complète la première, et elle seule, avec ce qui
       * restait sur la fiche. Idempotent — une campagne qui a déjà un code n'est pas
       * touchée, l'admin a pu le changer depuis.
       */
      const first = existing[existing.length - 1];
      const missing = !first.code && Boolean(inf.code);
      if (!missing) {
        console.log(`= ${inf.name.padEnd(22)} ${existing.length} campagne(s) déjà en place`);
        continue;
      }
      console.log(`+ ${inf.name.padEnd(22)} campagne n° ${first.seq} reprend le code ${inf.code} −${inf.discount} %${inf.endAt ? ` · fin ${new Date(inf.endAt).toISOString().slice(0, 10)}` : " · SANS FIN (à renseigner dans l'admin)"}`);
      if (!APPLY) continue;
      await upsertCampaign({ ...first, code: inf.code, discount: inf.discount, startAt: first.startAt ?? inf.createdAt, endAt: inf.endAt });
      await syncCampaignPromo(inf, inf.code);
      continue;
    }
    const hasSomething = inf.kit.lines.length > 0 || inf.contractId || inf.kitOrderId || inf.signatureId || inf.code;
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
    /* Les dates : le début est l'inscription, la fin celle qui était sur sa fiche. */
    const startAt = inf.createdAt;
    const endAt = inf.endAt;
    console.log(
      `~ ${inf.name.padEnd(22)} campagne n° 1 · ${status} · kit ${inf.kit.lines.length} titre(s)${inf.contractId ? " · contrat" : ""}` +
        `${inf.code ? ` · code ${inf.code} −${inf.discount} %` : " · sans code"}${endAt ? ` · fin ${new Date(endAt).toISOString().slice(0, 10)}` : " · SANS FIN (à renseigner dans l'admin)"}`,
    );
    if (!APPLY) continue;

    await upsertCampaign({
      influencerId: inf.id,
      seq: 1,
      name: "Première campagne",
      collaborationType: inf.collaborationType,
      code: inf.code,
      discount: inf.discount,
      startAt,
      endAt,
      contractId: inf.contractId,
      contractVariables: inf.contractVariables,
      kit: inf.kit,
      kitOrderId: inf.kitOrderId,
      signatureId: inf.signatureId,
      status,
    });
    /* Le document promo devient le reflet de la campagne : remise, dates, extinction. */
    if (inf.code) await syncCampaignPromo(inf, inf.code);
  }

  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
