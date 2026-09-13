import "server-only";
import { Campaign, type CampaignStatus } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Campagnes d'un partenaire.
 *
 * La fiche du partenaire décrit la personne ; la campagne décrit ce qui se négocie —
 * le kit, le contrat, les délais. Un partenaire en a autant qu'on veut dans le temps,
 * et rien n'est écrasé : une campagne terminée reste consultable, de part et d'autre.
 */

const campaigns = () => col("campaigns");

export type CampaignInput = Omit<Campaign, "id" | "createdAt" | "updatedAt" | "seq"> & { id?: string; seq?: number };

export async function upsertCampaign(input: CampaignInput): Promise<Campaign> {
  const id = input.id || newId("cmp");
  const existing = parseDoc(Campaign, await campaigns().doc(id).get());
  /* Le rang se calcule à la création seulement : il ne bouge plus ensuite, même si une
     campagne antérieure est supprimée. */
  const seq = existing?.seq ?? input.seq ?? (await nextSeq(input.influencerId));
  const doc = Campaign.parse({ ...input, id, seq, createdAt: existing?.createdAt ?? now(), updatedAt: now() });
  await campaigns().doc(id).set(doc);
  return doc;
}

async function nextSeq(influencerId: string): Promise<number> {
  const list = await listCampaigns(influencerId);
  return list.reduce((max, c) => Math.max(max, c.seq), 0) + 1;
}

/** Toutes les campagnes, tous partenaires confondus : pour les décomptes de l'admin. */
export async function listAllCampaigns(): Promise<Campaign[]> {
  return parseQuery(Campaign, campaigns().limit(2000));
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (!id) return null;
  return parseDoc(Campaign, await campaigns().doc(id).get());
}

/** Les campagnes d'un partenaire, la plus récente d'abord. */
export async function listCampaigns(influencerId: string): Promise<Campaign[]> {
  const list = await parseQuery(Campaign, campaigns().where("influencerId", "==", influencerId).limit(100));
  return list.sort((a, b) => b.seq - a.seq);
}

/*
 * La campagne à laquelle le partenaire a affaire aujourd'hui : celle qui est en cours,
 * sinon la dernière ouverte. Une campagne terminée ou annulée n'est plus « courante » —
 * elle ne propose plus de kit et n'attend plus de signature.
 */
export async function currentCampaign(influencerId: string): Promise<Campaign | null> {
  const list = await listCampaigns(influencerId);
  return list.find((c) => c.status === "active") ?? list.find((c) => c.status === "draft") ?? null;
}

export async function setCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  const at = now();
  await campaigns()
    .doc(id)
    .update({
      status,
      updatedAt: at,
      ...(status === "completed" ? { completedAt: at } : {}),
      ...(status === "cancelled" ? { cancelledAt: at } : {}),
    });
}

/** Rattache le kit commandé et la signature à la campagne, qui passe « en cours ». */
export async function markCampaignSigned(id: string, orderId: string, signatureId: string): Promise<void> {
  await campaigns().doc(id).update({ kitOrderId: orderId, signatureId, status: "active", updatedAt: now() });
}

/** Détache le kit supprimé : la campagne redevient ouverte, prête à être recommencée. */
export async function detachCampaignOrder(id: string): Promise<void> {
  await campaigns().doc(id).update({ kitOrderId: "", signatureId: "", status: "draft", updatedAt: now() });
}

export async function deleteCampaign(id: string): Promise<void> {
  await campaigns().doc(id).delete();
}

/** La campagne qui porte cette commande de kit, s'il y en a une. */
export async function findCampaignByOrder(orderId: string): Promise<Campaign | null> {
  if (!orderId) return null;
  const snap = await campaigns().where("kitOrderId", "==", orderId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? parseDoc(Campaign, doc) : null;
}
