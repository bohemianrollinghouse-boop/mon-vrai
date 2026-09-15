import type { BusinessDoc } from "@/lib/domain/types";
import { daysBefore } from "./expenses";

/*
 * Validité d'une pièce administrative. Une attestation de conformité, une assurance ou
 * un contrat ont une fin : périmée, la pièce ne protège plus rien, et on ne s'en aperçoit
 * qu'au moment où on en a besoin. D'où une alerte AVANT l'échéance, pas le jour venu.
 */

export type DocStatus = "none" | "valid" | "soon" | "expired";

/** Fenêtre d'alerte par défaut : deux mois, de quoi relancer un laboratoire ou un assureur. */
export const SOON_DAYS = 60;

export function docStatus(expiresAt: string, today: string, soonDays = SOON_DAYS): DocStatus {
  if (!expiresAt) return "none";
  if (expiresAt < today) return "expired";
  return expiresAt <= addDays(today, soonDays) ? "soon" : "valid";
}

/** Les pièces à surveiller, la plus urgente d'abord. */
export function needsAttention(docs: BusinessDoc[], today: string, soonDays = SOON_DAYS): BusinessDoc[] {
  return docs.filter((d) => ["expired", "soon"].includes(docStatus(d.expiresAt, today, soonDays))).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

const addDays = (day: string, n: number) => daysBefore(day, -n);
