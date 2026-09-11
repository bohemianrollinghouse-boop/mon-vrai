import "server-only";
import { InfluencerStatement } from "@/lib/domain/types";
import { col, now, parseQuery } from "./helpers";

/*
 * Relevés de commission. Seuls les mois PAYÉS sont écrits : le reste se déduit des
 * commandes (voir promos/statements.ts). Un relevé porte donc l'instantané des
 * montants versés, qui ne bouge plus ensuite.
 */

const statements = () => col("statements");

const docId = (influencerId: string, month: string) => `${influencerId}_${month}`;

export async function listStatements(influencerId: string): Promise<InfluencerStatement[]> {
  return parseQuery(InfluencerStatement, statements().where("influencerId", "==", influencerId));
}

/*
 * Fige un mois comme payé. On retient aussi le taux appliqué — il peut changer plus
 * tard, et une reprise doit se faire au taux réellement versé — et les commandes dont
 * la commission a été reprise sur ce relevé, pour ne pas les redéduire ensuite.
 */
export async function markStatementPaid(
  influencerId: string,
  month: string,
  amounts: { orders: number; revenue: number; commission: number; rate: number; clawedBack: string[] },
): Promise<InfluencerStatement> {
  const doc = InfluencerStatement.parse({ id: docId(influencerId, month), influencerId, month, ...amounts, status: "paid", paidAt: now(), updatedAt: now() });
  await statements().doc(doc.id).set(doc);
  return doc;
}

/** Annule le marquage : le mois redevient calculé à partir des commandes. */
export async function unmarkStatement(influencerId: string, month: string): Promise<void> {
  await statements().doc(docId(influencerId, month)).delete().catch(() => undefined);
}
