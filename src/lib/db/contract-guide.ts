import "server-only";
import { listCampaigns } from "./campaigns";
import { getContract, listSignaturesFor } from "./contracts";
import { getDocument } from "./documents";
import type { BusinessDoc, ContractGuide } from "@/lib/domain/types";

/*
 * L'annexe d'un contrat — le kit de création de contenu — et le droit de la lire.
 *
 * Les documents de la bibliothèque sont fermés : `storage.rules` en interdit la lecture
 * et `/api/documents/[id]` ne les sert qu'aux administrateurs. L'annexe fait exception,
 * et il faut donc dire précisément à qui : au créateur à qui ce contrat est PROPOSÉ, et
 * à celui qui l'a SIGNÉ. Pas à tous les partenaires — un contrat annexe parfois des
 * conditions qui ne regardent que ceux qu'elles lient.
 *
 * Le droit se relit en base à chaque appel, jamais dans l'adresse : l'identifiant du
 * contrat suffirait sinon à ouvrir l'annexe de n'importe quel autre. Le lien externe,
 * lui, n'a rien à protéger — il s'ouvre chez son hébergeur, pas chez nous.
 */

export type GuideView = {
  /** Le nom sous lequel le créateur la reconnaît. */
  label: string;
  /** Le PDF déposé, quand il y en a un et que le fichier existe encore. */
  doc: BusinessDoc | null;
  /** Le lien externe, quand il y en a un. */
  url: string;
};

/** L'annexe d'un contrat, prête à afficher. Nulle quand le contrat n'en porte aucune. */
export async function contractGuide(contractId: string): Promise<GuideView | null> {
  if (!contractId) return null;
  const contract = await getContract(contractId);
  return contract ? guideView(contract.guide) : null;
}

/*
 * Ce qu'une annexe donne à voir. Un PDF détaché de la bibliothèque depuis — supprimé,
 * remplacé — ne laisse pas une annexe cassée : il disparaît, et le lien subsiste seul.
 */
export async function guideView(guide: ContractGuide): Promise<GuideView | null> {
  if (!guide.documentId && !guide.url) return null;
  const doc = guide.documentId ? await getDocument(guide.documentId).catch(() => null) : null;
  if (!doc && !guide.url) return null;
  return { label: guide.label || doc?.title || "Kit de création de contenu", doc, url: guide.url };
}

/*
 * Ce partenaire peut-il lire l'annexe de ce contrat ? Oui si l'une de ses campagnes s'y
 * rattache — avant comme après la signature —, ou s'il l'a signé par le passé : une
 * campagne supprimée ne doit pas lui retirer un document qu'il a accepté.
 */
export async function partnerMayReadGuide(influencerId: string, contractId: string): Promise<boolean> {
  if (!influencerId || !contractId) return false;
  const campaigns = await listCampaigns(influencerId).catch(() => []);
  if (campaigns.some((c) => c.contractId === contractId)) return true;
  const signatures = await listSignaturesFor(influencerId).catch(() => []);
  return signatures.some((s) => s.contractId === contractId);
}
