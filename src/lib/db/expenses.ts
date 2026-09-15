import "server-only";
import { Expense } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Mouvements d'argent saisis à la main (frais de la société, apports, remboursements).
 * Les ventes n'entrent pas ici : elles sont déduites des commandes (voir /admin/revenus).
 *
 * Le tri se fait en mémoire, sur le jour civil : la collection reste de l'ordre de
 * quelques centaines de lignes par an, et cela évite un index composite de plus pour
 * chaque combinaison de filtres de l'écran.
 */

const expenses = () => col("expenses");

export async function listExpenses(limit = 2000): Promise<Expense[]> {
  const list = await parseQuery(Expense, expenses().limit(limit));
  return list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
}

export async function getExpense(id: string): Promise<Expense | null> {
  return parseDoc(Expense, await expenses().doc(id).get());
}

export type ExpenseInput = Omit<Expense, "id" | "createdAt" | "updatedAt"> & { id?: string };

/** Crée ou met à jour. Sans `id`, la ligne est nouvelle ; `createdAt` ne bouge jamais. */
export async function upsertExpense(input: ExpenseInput): Promise<Expense> {
  const id = input.id || newId("exp");
  const ref = expenses().doc(id);
  const existing = parseDoc(Expense, await ref.get());
  const doc = Expense.parse({ ...input, id, createdAt: existing?.createdAt ?? now(), updatedAt: now() });
  await ref.set(doc);
  return doc;
}

export async function deleteExpense(id: string): Promise<void> {
  await expenses().doc(id).delete();
}

/*
 * Un document supprimé quitte les mouvements qui s'y adossaient. On relit puis on
 * réécrit la liste amputée plutôt que d'utiliser `arrayRemove` : les toutes premières
 * lignes portent encore l'ancien champ `documentId`, que le schéma convertit à la
 * lecture — une écriture aveugle sur `documentIds` les laisserait avec les deux.
 */
export async function detachDocument(documentId: string): Promise<void> {
  const linked = await parseQuery(Expense, expenses().where("documentIds", "array-contains", documentId));
  const legacy = await parseQuery(Expense, expenses().where("documentId", "==", documentId));
  const all = new Map([...linked, ...legacy].map((e) => [e.id, e]));
  await Promise.all(
    [...all.values()].map((e) => upsertExpense({ ...e, documentIds: e.documentIds.filter((id) => id !== documentId) })),
  );
}
