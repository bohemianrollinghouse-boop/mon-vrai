import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { NewsletterSend, type NewsletterSendStats } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Historique des envois de newsletter. Un document par envoi, écrit au moment où l'on
 * envoie : c'est la seule trace, Resend ne sachant pas ce qu'est une « campagne » pour
 * nous — il ne connaît que des e-mails, un par destinataire.
 */

const sends = () => col("newsletterSends");

/* `sentAt` n'est fourni que par la reprise d'historique, qui connaît la vraie date de
   l'envoi ; un envoi ordinaire se date de lui-même. */
export type NewsletterSendInput = Omit<NewsletterSend, "id" | "sentAt" | "stats" | "statsAt" | "statsError"> & { sentAt?: number };

export async function recordNewsletterSend(input: NewsletterSendInput): Promise<NewsletterSend> {
  const doc = NewsletterSend.parse({ ...input, id: newId("nls"), sentAt: input.sentAt ?? now() });
  await sends().doc(doc.id).set(doc);
  return doc;
}

/** Les envois, du plus récent au plus ancien. Quelques dizaines au plus : tri en mémoire. */
export async function listNewsletterSends(limit = 100): Promise<NewsletterSend[]> {
  const list = await parseQuery(NewsletterSend, sends().limit(limit));
  return list.sort((a, b) => b.sentAt - a.sentAt);
}

export async function getNewsletterSend(id: string): Promise<NewsletterSend | null> {
  return parseDoc(NewsletterSend, await sends().doc(id).get());
}

/** Note ce que Resend dit de cet envoi, ou pourquoi on n'a pas pu le lui demander. */
export async function saveNewsletterSendStats(id: string, stats: NewsletterSendStats | null, error = ""): Promise<void> {
  // `stats` est facultatif, pas nullable : on efface le champ plutôt que d'y écrire null,
  // qui ferait échouer la relecture par le schéma.
  await sends().doc(id).update({ stats: stats ?? FieldValue.delete(), statsAt: now(), statsError: error });
}
