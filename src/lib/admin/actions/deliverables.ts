"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getCampaign } from "@/lib/db/campaigns";
import { deleteDeliverable, getDeliverable, newDeliverableId, recordDeliverable, setDeliverableMedia } from "@/lib/db/deliverables";
import { getInfluencer } from "@/lib/db/promos";
import { copyIntoMedia, deleteMedia } from "@/lib/db/media";
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

/*
 * Verse un contenu dans la médiathèque, pour qu'il puisse PARAÎTRE sur le site.
 *
 * Les deux endroits ne disent pas la même chose : le dossier d'une campagne garde ce
 * qu'on a reçu — privé, et qui doit le rester même une fois la collaboration finie —,
 * la médiathèque tient ce qui peut s'afficher publiquement.
 *
 * `media/` est lisible par TOUT LE MONDE — c'est ce qui permet à une photo produit de
 * s'afficher sur la boutique, et aucun mot de passe d'administration n'y change rien :
 * qui a l'adresse a le fichier. Verser un contenu est donc un acte de PUBLICATION, et
 * c'est pourquoi il reste un geste, fichier par fichier, et jamais automatique.
 *
 * Les deux écrans n'en font qu'un pour autant : /admin/medias montre les deux coffres
 * côte à côte (voir admin/media-shelf.ts), sans rien recopier.
 *
 * La pièce reste au dossier : c'est une copie. Et elle n'est versée qu'une fois — la
 * fiche retient l'identifiant du média, un second clic ne referait pas un doublon.
 */
export async function publishDeliverableAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const doc = await getDeliverable(id);
  if (!doc) return failed("Ce contenu n'existe plus.");
  if (doc.mediaId) return saved("Ce fichier est déjà dans la médiathèque.");

  try {
    /* Le dossier du partenaire, comme au versement automatique : un fichier rattrapé
       ici doit se ranger au même endroit que ses voisins. */
    const owner = await getInfluencer(doc.influencerId).catch(() => null);
    const media = await copyIntoMedia({ path: doc.path, mime: doc.mime, filename: doc.filename, folder: owner?.name ?? "" });
    await setDeliverableMedia(doc.id, media.id);
    await audit(user.email, "deliverable.publish", `deliverables/${doc.id}`, `→ médias/${media.id}`);
    revalidatePath(campaignPath(doc.influencerId, doc.campaignId));
    revalidatePath("/admin/medias");
    return saved(`${doc.filename} est dans la médiathèque.`);
  } catch (e) {
    return failed((e as Error).message);
  }
}

/*
 * Retire du public un contenu qu'on y avait versé : la copie de `media/` est effacée,
 * et la fiche oublie son identifiant.
 *
 * Le fichier reçu, lui, ne bouge pas — il est dans `ugc/`, et c'est la pièce de
 * référence. Publier est un acte qui doit pouvoir se défaire sans rien perdre : sans
 * cela on n'ose plus publier, et le bouton ne sert plus à rien.
 */
export async function unpublishDeliverableAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const doc = await getDeliverable(id);
  if (!doc) return failed("Ce contenu n'existe plus.");
  if (!doc.mediaId) return saved("Ce contenu n'est pas public.");

  await deleteMedia(doc.mediaId).catch(() => undefined);
  await setDeliverableMedia(doc.id, "");
  await audit(user.email, "deliverable.unpublish", `deliverables/${doc.id}`, doc.filename);
  revalidatePath(campaignPath(doc.influencerId, doc.campaignId));
  revalidatePath("/admin/medias");
  return saved(`${doc.filename} n'est plus public.`);
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
