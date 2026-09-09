import "server-only";
import { storage } from "@/lib/firebase/admin";
import { getOrder, setInvoiceDoc } from "@/lib/db/orders";
import type { Order } from "@/lib/domain/types";

/*
 * Facture = document de Tiime. On ne génère plus de PDF nous-mêmes : le scénario Make
 * renvoie le PDF de la facture Tiime (base64), qu'on dépose dans un dossier privé du
 * bucket et qu'on rattache à la commande (numéro Tiime + chemin). La facture reste un
 * document figé, jamais régénéré côté site ; l'admin peut la refaire via « Refacturer
 * dans Tiime », qui la redépose.
 */

function storagePathFor(order: Order, at: number): string {
  const year = new Date(at).getFullYear();
  return `invoices/${year}/${order.id}.pdf`;
}

/** Dépose le PDF de la facture Tiime et le rattache à la commande. */
export async function storeTiimeInvoice(order: Order, pdf: Buffer, number: string): Promise<Order> {
  const issuedAt = order.invoice?.issuedAt ?? Date.now();
  const path = order.invoice?.storagePath ?? storagePathFor(order, issuedAt);
  await storage()
    .bucket()
    .file(path)
    .save(pdf, { contentType: "application/pdf", metadata: { cacheControl: "private, max-age=0" } });
  await setInvoiceDoc(order.id, { number, issuedAt, storagePath: path });
  return (await getOrder(order.id)) ?? order;
}

/** Octets du PDF de facture stocké, ou null si la commande n'en a pas encore. */
export async function readInvoicePdf(orderId: string): Promise<{ order: Order; bytes: Buffer } | null> {
  const order = await getOrder(orderId);
  if (!order?.invoice?.storagePath) return null;
  const [bytes] = await storage().bucket().file(order.invoice.storagePath).download();
  return { order, bytes };
}
