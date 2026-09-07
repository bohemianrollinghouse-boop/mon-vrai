import "server-only";
import { col, newId, now } from "@/lib/db/helpers";

/*
 * Journal d'audit de l'administration : qui a fait quoi, sur quoi, quand. Une ligne par
 * action qui modifie des données. Consultable dans l'admin, jamais supprimé par
 * l'interface.
 */

export type AuditEntry = {
  id: string;
  at: number;
  who: string;
  what: string;
  target: string;
  note?: string;
};

export async function audit(who: string, what: string, target: string, note?: string): Promise<void> {
  const entry: AuditEntry = { id: newId("aud"), at: now(), who, what, target, note };
  await col("audit").doc(entry.id).set(entry);
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const snap = await col("audit").orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as AuditEntry);
}
