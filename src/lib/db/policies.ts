import "server-only";
import { Policy, type RichBody } from "@/lib/domain/types";
import { col, now, parseDoc, parseQuery } from "./helpers";

/*
 * Pages légales. Elles ressemblent aux pages libres mais vivent à part : elles ont
 * un ordre d'affichage (le menu latéral du gabarit 7C) et ne peuvent pas être
 * dépubliées - un site marchand doit toujours les montrer.
 */

const policies = () => col("policies");

export async function listPolicies(): Promise<Policy[]> {
  return parseQuery(Policy, policies().orderBy("position"));
}

export async function getPolicy(handle: string): Promise<Policy | null> {
  return parseDoc(Policy, await policies().doc(handle).get());
}

export type PolicyInput = { handle: string; title: string; body: RichBody; position: number };

export async function upsertPolicy(input: PolicyInput): Promise<Policy> {
  const doc = Policy.parse({ ...input, updatedAt: now() });
  await policies().doc(input.handle).set(doc);
  return doc;
}

export async function deletePolicy(handle: string): Promise<void> {
  await policies().doc(handle).delete();
}
