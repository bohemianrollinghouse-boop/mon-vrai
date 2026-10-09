"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getCampaign } from "@/lib/db/campaigns";
import { deleteDeliverable, getDeliverable, newDeliverableId, recordDeliverable } from "@/lib/db/deliverables";
import { contentKind, contentPath } from "@/lib/domain/deliverables";

/*
 * Les contenus rendus par un partenaire, déposés depuis la page de sa campagne.
 *
 * L'envoi se fait en deux temps, parce que le fichier ne passe pas par ici (voir
 * db/deliverables.ts) : « préparer » donne au navigateur l'endroit exact où déposer,
 * « inscrire » relit l'objet arrivé et lui fait une fiche. Entre les deux, rien
 * n'existe en base — un envoi interrompu ne laisse donc aucune ligne, seulement un
 * objet orphelin qu'un nouvel envoi du même fichier remplacera.
 */

const campaignPath = (influencerId: string, campaignId: string) => `/admin/influenceurs/${influencerId}/campagnes/${campaignId}`;

export type PrepareResult = { ok: true; id: string; path: string } | { ok: false; error: string };

/** Où déposer ce fichier. La campagne est relue : son identifiant nomme le dossier. */
export async function prepareDeliverableAction(campaignId: string, filename: string, mime: string): Promise<PrepareResult> {
  await assertAdmin();
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campagne introuvable" };
  /* Refusé ici aussi, et pas seulement par les règles du coffre : mieux vaut le dire
     avant d'avoir envoyé deux cents mégaoctets pour rien. */
  if (!contentKind(filename, mime)) return { ok: false, error: `${filename} : ni photo ni vidéo.` };

  const id = newDeliverableId();
  return { ok: true, id, path: contentPath(campaign.id, id, filename) };
}

/** Le fichier est arrivé : on le relit dans le coffre, et on lui fait sa fiche. */
export async function confirmDeliverableAction(campaignId: string, id: string, filename: string): Promise<AdminResult> {
  const user = await assertAdmin();
  const campaign = await getCampaign(campaignId);
  if (!campaign) return failed("Campagne introuvable");

  try {
    const doc = await recordDeliverable({ id, campaignId: campaign.id, influencerId: campaign.influencerId, filename });
    await audit(user.email, "deliverable.add", `deliverables/${doc.id}`, `${doc.kind === "photo" ? "photo" : "vidéo"} · campagne n° ${campaign.seq}`);
    revalidatePath(campaignPath(campaign.influencerId, campaign.id));
    revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
    return saved(`${doc.filename} ajouté.`);
  } catch (e) {
    return failed(`${filename} : ${(e as Error).message}`);
  }
}

export async function deleteDeliverableAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const existing = await getDeliverable(id);
  if (!existing) return failed("Ce contenu n'existe plus.");

  await deleteDeliverable(id);
  await audit(user.email, "deliverable.delete", `deliverables/${id}`, existing.filename);
  revalidatePath(campaignPath(existing.influencerId, existing.campaignId));
  revalidatePath(`/admin/influenceurs/${existing.influencerId}`);
  return saved(`${existing.filename} retiré.`);
}
