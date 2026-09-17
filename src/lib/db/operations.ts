import "server-only";
import { Operation } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Les campagnes partagées : ce qu'on organise une fois — un nom, des dates, un kit, un
 * contrat, une remise — avant de l'appliquer à plusieurs partenaires.
 *
 * Ce document ne nomme personne. Ce qu'une personne en fait vit dans sa participation,
 * c'est-à-dire un document de `campaigns` portant `operationId` (voir db/campaigns.ts et
 * le commentaire de `Operation` dans domain/types.ts).
 */

const operations = () => col("operations");

export type OperationInput = Omit<Operation, "id" | "createdAt" | "updatedAt"> & { id?: string };

export async function listOperations(): Promise<Operation[]> {
  const list = await parseQuery(Operation, operations().limit(500));
  /* La plus récente d'abord : on regarde ce qui court, pas ce qui est passé. */
  return list.sort((a, b) => b.startAt - a.startAt);
}

export async function getOperation(id: string): Promise<Operation | null> {
  if (!id) return null;
  return parseDoc(Operation, await operations().doc(id).get());
}

export async function upsertOperation(input: OperationInput): Promise<Operation> {
  const id = input.id || newId("op");
  const existing = parseDoc(Operation, await operations().doc(id).get());
  const doc = Operation.parse({ ...input, id, createdAt: existing?.createdAt ?? now(), updatedAt: now() });
  await operations().doc(id).set(doc);
  return doc;
}

export async function deleteOperation(id: string): Promise<void> {
  await operations().doc(id).delete();
}
