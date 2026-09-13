import "server-only";
import { listCampaigns } from "./campaigns";
import { getSignature } from "./contracts";
import { getInfluencer, upsertInfluencer } from "./promos";

/*
 * « Collaboration en cours » se constate, il ne se déclare pas.
 *
 * Les quatre premiers états du démarchage décrivent une conversation, et se posent à la
 * main : personne d'autre que l'administration ne sait si un message a reçu réponse. Le
 * cinquième, lui, est un fait vérifiable — il y a, ou il n'y a pas, un contrat signé qui
 * court. On le relit donc de la base à chaque fois que cela peut avoir changé : à la
 * signature, à la clôture d'une campagne, à la suppression d'une commande de kit.
 *
 * Le retour se fait vers « validé » et pas plus bas : quelqu'un qui a signé une fois ne
 * redevient pas un inconnu à démarcher.
 */
export async function refreshOutreach(influencerId: string): Promise<void> {
  if (!influencerId) return;
  const influencer = await getInfluencer(influencerId);
  if (!influencer) return;

  const campaigns = await listCampaigns(influencerId);
  const signatures = await Promise.all(campaigns.map((c) => getSignature(c.signatureId).catch(() => null)));
  const running = signatures.some((s) => s?.state === "active");

  const next = running ? "collab" : influencer.outreach === "collab" ? "validated" : influencer.outreach;
  if (next === influencer.outreach) return;
  await upsertInfluencer({ ...influencer, outreach: next });
}
