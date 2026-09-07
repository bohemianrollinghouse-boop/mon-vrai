import "server-only";
import type { DocumentSnapshot, Query } from "firebase-admin/firestore";
import type { ZodType } from "zod";
import { db } from "@/lib/firebase/admin";

/*
 * Petits outils partagés par les dépôts. Chaque document lu passe par son schéma :
 * une donnée malformée en base est signalée à la lecture, pas découverte plus tard
 * dans un composant.
 */

export const now = () => Date.now();

export function col(name: string) {
  return db().collection(name);
}

/** Valide un instantané ; renvoie null s'il n'existe pas. Lève si le contenu est invalide. */
export function parseDoc<T>(schema: ZodType<T>, snap: DocumentSnapshot): T | null {
  if (!snap.exists) return null;
  const result = schema.safeParse(snap.data());
  if (!result.success) {
    throw new Error(`Document ${snap.ref.path} invalide : ${result.error.message}`);
  }
  return result.data;
}

export async function parseQuery<T>(schema: ZodType<T>, query: Query): Promise<T[]> {
  const snap = await query.get();
  return snap.docs.map((d) => parseDoc(schema, d)).filter((x): x is T => x !== null);
}

/** Identifiant court et lisible pour les documents créés côté serveur. */
export function newId(prefix = ""): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return prefix ? `${prefix}_${raw}` : raw;
}
