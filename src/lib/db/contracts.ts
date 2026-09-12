import "server-only";
import { createHash } from "node:crypto";
import { Contract, ContractSignature } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Contrats de collaboration, et leurs signatures.
 *
 * Deux collections séparées, et c'est essentiel : un contrat se réécrit dans l'admin,
 * une signature jamais. Ce qui a été accepté est recopié dans la signature — texte,
 * produits, valeurs — pour qu'une refonte du contrat ou une hausse de prix ne modifie
 * rien de ce qui est déjà signé.
 */

const contracts = () => col("contracts");
const signatures = () => col("contractSignatures");

export type ContractInput = Omit<Contract, "id" | "createdAt" | "updatedAt"> & { id?: string };

export async function upsertContract(input: ContractInput): Promise<Contract> {
  const id = input.id || newId("ctr");
  const existing = parseDoc(Contract, await contracts().doc(id).get());
  const doc = Contract.parse({ ...input, id, createdAt: existing?.createdAt ?? now(), updatedAt: now() });
  await contracts().doc(id).set(doc);
  return doc;
}

export async function getContract(id: string): Promise<Contract | null> {
  if (!id) return null;
  return parseDoc(Contract, await contracts().doc(id).get());
}

/** Tous les contrats, les plus récents d'abord. Quelques-uns au plus : tri en mémoire. */
export async function listContracts(): Promise<Contract[]> {
  const list = await parseQuery(Contract, contracts().limit(200));
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteContract(id: string): Promise<void> {
  await contracts().doc(id).delete();
}

export type SignatureInput = Omit<ContractSignature, "id" | "acceptedAt" | "contractHash">;

/*
 * Enregistre une acceptation. L'empreinte est calculée ici, sur la copie figée, et non
 * fournie par l'appelant : c'est elle qui permettra de vérifier, plus tard, que le
 * document conservé est bien celui qui a été accepté.
 */
export async function recordSignature(input: SignatureInput): Promise<ContractSignature> {
  const acceptedAt = now();
  const hash = createHash("sha256")
    .update([input.contractVersion, input.summarySnapshot, input.bodySnapshot, input.signerTypedName, String(acceptedAt)].join("\n---\n"))
    .digest("hex");
  const doc = ContractSignature.parse({ ...input, id: newId("sig"), acceptedAt, contractHash: hash });
  await signatures().doc(doc.id).set(doc);
  return doc;
}

export async function getSignature(id: string): Promise<ContractSignature | null> {
  if (!id) return null;
  return parseDoc(ContractSignature, await signatures().doc(id).get());
}

/** Signatures d'un partenaire, la plus récente d'abord. */
export async function listSignaturesFor(influencerId: string): Promise<ContractSignature[]> {
  const list = await parseQuery(ContractSignature, signatures().where("influencerId", "==", influencerId).limit(50));
  return list.sort((a, b) => b.acceptedAt - a.acceptedAt);
}
