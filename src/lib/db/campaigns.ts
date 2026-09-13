import "server-only";
import { Campaign, Promo, type CampaignStatus, type Influencer } from "@/lib/domain/types";
import { campaignLive, liveCampaign } from "@/lib/promos/campaign";
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

/*
 * L'horloge, lue par la base. Un composant serveur doit rester pur
 * (react-hooks/purity) : il ne lit pas l'heure lui-même, il la reçoit — c'est déjà ainsi
 * qu'adminSnapshot et partnerSnapshot la donnent.
 */
export async function clockNow(): Promise<number> {
  return now();
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
  return liveCampaign(await listCampaigns(influencerId));
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

/* ---------- Le code promo d'une campagne ---------- */

const promos = () => col("promos");

/*
 * Réécrit `promos/<CODE>` d'après les campagnes qui le portent.
 *
 * Le document promo n'est qu'un reflet : c'est la campagne qui décide de la remise, des
 * dates et de l'extinction. On le recalcule donc à chaque fois que quelque chose bouge
 * — enregistrement, clôture, suppression, changement de code.
 *
 * Deux campagnes peuvent se partager un code (une nouvelle campagne reprend par défaut
 * celui de la précédente) : c'est la plus récente ENCORE VIVANTE qui le gouverne. Quand
 * il n'en reste aucune, le code est éteint mais jamais effacé — ses utilisations et les
 * commandes qui le citent doivent rester lisibles.
 */
export async function syncCampaignPromo(influencer: Influencer, code: string): Promise<void> {
  const upper = code.trim().toUpperCase();
  if (!upper) return;
  const ref = promos().doc(upper);
  const existing = parseDoc(Promo, await ref.get());
  /* Un code qui n'est pas le sien ne se touche pas : l'admin l'a déjà refusé en amont. */
  if (existing && existing.influencerId && existing.influencerId !== influencer.id) return;

  const at = now();
  const carrying = (await listCampaigns(influencer.id)).filter((c) => c.code === upper);
  const owner = carrying.find((c) => campaignLive(c, at)) ?? carrying[0] ?? null;

  if (!owner) {
    if (existing) await ref.update({ active: false, campaignId: "", updatedAt: at }).catch(() => undefined);
    return;
  }

  await ref.set(
    Promo.parse({
      code: upper,
      description: `Code influenceur · ${influencer.name}${owner.name ? ` · ${owner.name}` : ""}`,
      type: "percent",
      amount: owner.discount,
      minimum: existing?.minimum ?? 0,
      startAt: owner.startAt ?? owner.createdAt,
      endAt: owner.endAt,
      perCustomer: existing?.perCustomer ?? 1,
      stackWith: existing?.stackWith ?? [],
      gifts: [],
      /* Le partenaire en pause coupe tout ; sinon c'est la campagne qui décide. */
      active: influencer.active && campaignLive(owner, at),
      influencerId: influencer.id,
      campaignId: owner.id,
      uses: existing?.uses ?? 0,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    }),
  );
}

/** Tous les codes portés par les campagnes d'un partenaire, sans doublon. */
export async function campaignCodes(influencerId: string): Promise<string[]> {
  const list = await listCampaigns(influencerId);
  return [...new Set(list.map((c) => c.code).filter(Boolean))];
}

/** À la suppression d'un partenaire : ses campagnes s'en vont, ses codes s'éteignent. */
export async function dropCampaignsOf(influencer: Influencer): Promise<void> {
  const list = await listCampaigns(influencer.id);
  const codes = [...new Set(list.map((c) => c.code).filter(Boolean))];
  await Promise.all(list.map((c) => campaigns().doc(c.id).delete().catch(() => undefined)));
  await Promise.all(codes.map((code) => syncCampaignPromo(influencer, code).catch(() => undefined)));
}
