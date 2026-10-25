import "server-only";
import { listCampaigns } from "./campaigns";
import { getContract, listSignaturesFor } from "./contracts";
import { getDocument } from "./documents";
import type { BusinessDoc } from "@/lib/domain/types";

/*
 * L'annexe d'un contrat — le kit de création de contenu — et le droit de la lire.
 *
 * Les documents de la bibliothèque sont fermés : `storage.rules` en interdit la lecture
 * et `/api/documents/[id]` ne les sert qu'aux administrateurs. Celui-ci fait exception,
 * et il faut donc dire précisément à qui : au créateur à qui ce contrat est PROPOSÉ, et
 * à celui qui l'a SIGNÉ. Pas à tous les partenaires — un contrat annexe parfois des
 * conditions qui ne regardent que ceux qu'elles lient.
 *
 * Le droit se relit en base à chaque appel, jamais dans l'adresse : l'identifiant du
 * contrat suffirait sinon à ouvrir l'annexe de n'importe quel autre.
 */

/** Le document annexé à ce contrat, s'il en porte un et que le fichier existe encore. */
export async function contractGuide(contractId: string): Promise<BusinessDoc | null> {
  if (!contractId) return null;
  const contract = await getContract(contractId);
  if (!contract?.guideDocumentId) return null;
  return getDocument(contract.guideDocumentId).catch(() => null);
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
