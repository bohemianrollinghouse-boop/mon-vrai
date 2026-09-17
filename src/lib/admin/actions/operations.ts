"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { contractVariablesFrom, dayStamp, kitLines } from "@/lib/admin/campaign-form";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteCampaign, listCampaigns, listCampaignsByOperation, syncCampaignPromo, upsertCampaign } from "@/lib/db/campaigns";
import { deleteOperation, getOperation, upsertOperation } from "@/lib/db/operations";
import { getInfluencer, getPromo } from "@/lib/db/promos";
import { CollaborationType, type Influencer, type Operation } from "@/lib/domain/types";
import { codeCandidates, lastCode } from "@/lib/promos/operation";

/*
 * Les campagnes partagées, et leur application à plusieurs partenaires.
 *
 * Une campagne dit ce qu'on organise ; l'appliquer à quelqu'un ouvre sa PARTICIPATION —
 * une campagne au sens de db/campaigns.ts, avec son code à lui, son kit à commander et
 * son contrat à signer. Ces participations suivent ensuite leur cours chacune de leur
 * côté : elles se règlent une par une, et rien ici ne les réécrit après coup.
 */

const operationPath = (id: string) => `/admin/campagnes/${id}`;

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1).max(80),
  collaborationType: CollaborationType.default("UGC"),
  startAt: z.string().trim().default(""),
  endAt: z.string().trim().default(""),
  discount: z.number().int().min(0).max(100).default(10),
  codeMode: z.enum(["partner", "none"]).default("partner"),
  contractId: z.string().trim().default(""),
  note: z.string().trim().max(2000).default(""),
  /* Le kit, dans le même formulaire : il fait partie de ce qui se décide. */
  enabled: z.boolean().default(false),
  deductStock: z.boolean().default(false),
  prototype: z.boolean().default(false),
  title: z.string().trim().max(80).default("Votre kit de bienvenue"),
  text: z.string().trim().max(400).default(""),
  /** Sélection sérialisée par l'éditeur : `slug:quantité`, séparés par des virgules. */
  lines: z.string().default(""),
});

export async function saveOperationAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["discount"], booleans: ["enabled", "deductStock", "prototype"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const existing = d.id ? await getOperation(d.id) : null;
  if (d.id && !existing) return failed("Campagne introuvable");

  const lines = kitLines(d.lines);
  if (d.enabled && lines.length === 0) return failed("Choisissez au moins un livre avant de proposer le kit.", { lines: "Sélection vide" });

  /*
   * Mêmes exigences que pour une participation : le code ne vaut qu'entre les deux
   * dates, et le contrat les cite.
   */
  const startAt = dayStamp(d.startAt, "start");
  const endAt = dayStamp(d.endAt, "end");
  if (startAt === null) return failed("Indiquez la date de début de la campagne.", { startAt: "Date requise" });
  if (endAt === null) return failed("Indiquez la date de fin de la campagne.", { endAt: "Date requise" });
  if (endAt < startAt) return failed("La fin de campagne précède son début.", { endAt: "Après le début" });

  const operation = await upsertOperation({
    id: existing?.id,
    name: d.name,
    collaborationType: d.collaborationType,
    startAt,
    endAt,
    discount: d.discount,
    codeMode: d.codeMode,
    contractId: d.contractId,
    contractVariables: contractVariablesFrom(formData),
    kit: { enabled: d.enabled, title: d.title, text: d.text, lines, deductStock: d.deductStock, prototype: d.prototype },
    note: d.note,
  });

  await audit(user.email, existing ? "operation.update" : "operation.create", `operations/${operation.id}`, operation.name);
  revalidatePath("/admin/campagnes");
  revalidatePath(operationPath(operation.id));
  /* Création : on arrive sur sa page, là où l'on ajoute les participants. */
  if (!existing) return { ok: true, message: `Campagne « ${operation.name} » créée.`, redirectTo: operationPath(operation.id) };
  return saved(`Campagne « ${operation.name} » enregistrée. Les participations déjà ouvertes ne changent pas.`);
}

/* ---------- Appliquer à plusieurs partenaires ---------- */

const ApplyInput = z.object({
  operationId: z.string().min(1),
  influencerIds: z.array(z.string()).default([]),
});

export async function applyOperationAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(ApplyInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);

  const operation = await getOperation(parsed.data.operationId);
  if (!operation) return failed("Campagne introuvable");
  const ids = [...new Set(parsed.data.influencerIds.filter(Boolean))];
  if (ids.length === 0) return failed("Cochez au moins un influenceur.");

  const already = new Set((await listCampaignsByOperation(operation.id)).map((c) => c.influencerId));
  /*
   * Les codes posés pendant cette application ne sont pas encore relisibles en base : on
   * les tient à part pour que deux partenaires ne repartent pas avec le même.
   */
  const claimed = new Set<string>();
  const added: string[] = [];
  const skipped: string[] = [];

  for (const id of ids) {
    const influencer = await getInfluencer(id);
    if (!influencer) {
      skipped.push("un partenaire inconnu");
      continue;
    }
    if (already.has(id)) {
      skipped.push(`${influencer.name} y participe déjà`);
      continue;
    }

    const code = operation.codeMode === "none" ? "" : await freeCode(influencer, operation, claimed);
    if (operation.codeMode === "partner" && !code) {
      skipped.push(`${influencer.name} : aucun code libre`);
      continue;
    }
    if (code) claimed.add(code);

    const campaign = await upsertCampaign({
      influencerId: influencer.id,
      operationId: operation.id,
      name: operation.name,
      collaborationType: operation.collaborationType,
      code,
      discount: operation.discount,
      startAt: operation.startAt,
      endAt: operation.endAt,
      contractId: operation.contractId,
      contractVariables: operation.contractVariables,
      kit: operation.kit,
      kitOrderId: "",
      signatureId: "",
      status: "draft",
    });

    /* Le document promo n'est qu'un reflet de la participation : on le pose. */
    if (code) await syncCampaignPromo(influencer, code).catch((err) => console.warn("[campagne] code non synchronisé :", (err as Error).message));
    await audit(user.email, "operation.apply", `campaigns/${campaign.id}`, `${operation.name} → ${influencer.name}`);
    added.push(influencer.name);
    revalidatePath(`/admin/influenceurs/${influencer.id}`);
  }

  revalidatePath("/admin/campagnes");
  revalidatePath(operationPath(operation.id));
  revalidatePath("/admin/codes-promo");
  revalidatePath("/partenaire");

  /* Le compte rendu est par partenaire : un code déjà pris n'empêche pas les autres. */
  const done = added.length
    ? `${added.length} participation${added.length > 1 ? "s" : ""} ouverte${added.length > 1 ? "s" : ""}`
    : "Aucune participation ouverte";
  const left = skipped.length ? ` · ignoré : ${skipped.join(", ")}` : "";
  if (added.length === 0) return failed(`${done}${left}.`);
  return saved(`${done}${left}.`);
}

/*
 * Le code d'un participant : le sien s'il en avait un, sinon dérivé de son pseudo. On
 * descend les candidats jusqu'au premier qui ne soit ni retenu dans cette application ni
 * déjà la propriété de quelqu'un d'autre.
 */
async function freeCode(influencer: Influencer, operation: Operation, claimed: Set<string>): Promise<string> {
  const previous = lastCode(await listCampaigns(influencer.id));
  for (const candidate of codeCandidates({ handle: influencer.handle, name: influencer.name, previous }, operation.discount)) {
    if (claimed.has(candidate)) continue;
    const promo = await getPromo(candidate);
    if (!promo || promo.influencerId === influencer.id) return candidate;
  }
  return "";
}

/*
 * Les codes des participants, tous d'un coup.
 *
 * Une campagne porte autant de codes que de partenaires : un code promo appartient à
 * quelqu'un (`promos/<CODE>` porte un influencerId), et c'est lui qui attribue SES
 * ventes. Celui proposé à l'application n'est qu'un point de départ — on le corrige ici,
 * côte à côte, plutôt que d'ouvrir chaque participation l'une après l'autre.
 *
 * Postés en `code:<id de la participation>`, comme les variables de contrat en `cvar:` :
 * `parseForm` ignore ce genre de clé, et la lecture directe reste la plus simple.
 */
export async function saveParticipantCodesAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const operationId = String(formData.get("operationId") ?? "");
  const operation = await getOperation(operationId);
  if (!operation) return failed("Campagne introuvable");

  const participants = await listCampaignsByOperation(operationId);
  const wanted = new Map<string, string>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("code:") || typeof value !== "string") continue;
    wanted.set(key.slice(5), value.trim().toUpperCase());
  }

  /*
   * Les codes tels qu'ils seraient après coup, pour repérer deux participants qui
   * repartiraient avec le même — ce qui rendrait leurs ventes indiscernables.
   */
  const tally = new Map<string, number>();
  for (const c of participants) {
    const next = wanted.get(c.id) ?? c.code;
    if (next) tally.set(next, (tally.get(next) ?? 0) + 1);
  }

  const changed: string[] = [];
  const refused: string[] = [];

  for (const c of participants) {
    const next = wanted.get(c.id);
    if (next === undefined || next === c.code) continue;

    const influencer = await getInfluencer(c.influencerId);
    const who = influencer?.name ?? "Ce partenaire";
    if (!influencer) {
      refused.push(`${who} : fiche introuvable`);
      continue;
    }
    if (next && !/^[A-Z0-9]{2,24}$/.test(next)) {
      refused.push(`${who} : ${next || "vide"} n'est pas un code valide`);
      continue;
    }
    if (next && (tally.get(next) ?? 0) > 1) {
      refused.push(`${who} : ${next} est donné à un autre participant`);
      continue;
    }
    const promo = next ? await getPromo(next) : null;
    if (promo && promo.influencerId !== influencer.id) {
      refused.push(`${who} : ${next} ${promo.influencerId ? "appartient à un autre partenaire" : "est un code promo interne"}`);
      continue;
    }

    await upsertCampaign({ ...c, code: next });
    /*
     * Le nouveau code ET l'ancien : ce dernier peut n'être plus porté par personne, et
     * doit alors s'éteindre — jamais s'effacer, ses utilisations passées restent lisibles.
     */
    for (const code of new Set([next, c.code].filter(Boolean))) {
      await syncCampaignPromo(influencer, code).catch((err) => console.warn("[campagne] code non synchronisé :", (err as Error).message));
    }
    await audit(user.email, "operation.code", `campaigns/${c.id}`, `${influencer.name} · ${c.code || "aucun"} → ${next || "aucun"}`);
    changed.push(influencer.name);
    revalidatePath(`/admin/influenceurs/${influencer.id}`);
  }

  revalidatePath(operationPath(operationId));
  revalidatePath("/admin/codes-promo");
  revalidatePath("/partenaire");

  const left = refused.length ? ` · refusé : ${refused.join(", ")}` : "";
  if (changed.length === 0) {
    return refused.length ? failed(`Aucun code modifié${left}.`) : saved("Aucun changement de code.");
  }
  return saved(`${changed.length} code${changed.length > 1 ? "s" : ""} enregistré${changed.length > 1 ? "s" : ""}${left}.`);
}

/*
 * Retire un participant. Refusé dès que sa participation a produit quelque chose : une
 * commande partie ou un contrat signé sont des faits. Pour défaire une collaboration
 * engagée, on supprime la commande du kit (voir actions/orders.ts).
 */
export async function removeParticipantAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const participants = await listCampaignsByOperation(String(formData.get("operationId") ?? ""));
  const campaign = participants.find((c) => c.id === id);
  if (!campaign) return failed("Participation introuvable");
  if (campaign.kitOrderId || campaign.signatureId) {
    return failed("Ce partenaire a déjà commandé son kit ou signé : supprimez la commande pour l'annuler.");
  }

  await deleteCampaign(id);
  const influencer = await getInfluencer(campaign.influencerId);
  if (influencer && campaign.code) await syncCampaignPromo(influencer, campaign.code).catch(() => undefined);
  await audit(user.email, "operation.remove", `campaigns/${id}`, `${campaign.name} → ${influencer?.name ?? campaign.influencerId}`);
  revalidatePath(operationPath(campaign.operationId));
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
  revalidatePath("/admin/codes-promo");
  revalidatePath("/partenaire");
  return saved(`${influencer?.name ?? "Le partenaire"} ne participe plus à cette campagne.`);
}

/*
 * Supprime une campagne. Refusé tant qu'elle a des participants : les retirer un par un
 * oblige à voir ce qu'on défait, et le retrait bute alors sur ceux qui ont déjà reçu
 * leur kit — ce qui est le but.
 */
export async function deleteOperationAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const operation = await getOperation(id);
  if (!operation) return failed("Campagne introuvable");
  const participants = await listCampaignsByOperation(id);
  if (participants.length > 0) {
    return failed(`Cette campagne a ${participants.length} participant${participants.length > 1 ? "s" : ""} : retirez-les d'abord.`);
  }

  await deleteOperation(id);
  await audit(user.email, "operation.delete", `operations/${id}`, operation.name);
  revalidatePath("/admin/campagnes");
  /*
   * Redirection côté serveur : une action serveur invalide la route courante, qui est
   * ici la campagne qu'on vient d'effacer — elle se rendrait en 404 le temps que la
   * redirection aboutisse.
   */
  redirect("/admin/campagnes");
}
