import "server-only";
import { storage } from "@/lib/firebase/admin";
import { assignInvoiceNumber, getOrder, setInvoiceFile } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";
import type { Order } from "@/lib/domain/types";
import { renderInvoicePdf } from "./pdf";

/*
 * Émission d'une facture : réserver le numéro (transaction), rendre le PDF, le déposer
 * dans un dossier privé du bucket, mémoriser le chemin. Idempotent : une commande déjà
 * facturée n'est pas renumérotée, et un PDF déjà déposé n'est pas régénéré — la facture
 * est un document comptable figé.
 */

export function invoiceStoragePath(order: Order): string {
  if (!order.invoice) throw new Error("Commande sans numéro de facture");
  const year = new Date(order.invoice.issuedAt).getFullYear();
  return `invoices/${year}/${order.invoice.number}.pdf`;
}

export async function issueInvoice(orderId: string): Promise<Order> {
  let order = await assignInvoiceNumber(orderId);
  if (order.invoice?.storagePath) return order;

  const settings = await getSettings();
  const bytes = await renderInvoicePdf(order, settings);
  const path = invoiceStoragePath(order);
  await storage()
    .bucket()
    .file(path)
    .save(Buffer.from(bytes), { contentType: "application/pdf", metadata: { cacheControl: "private, max-age=0" } });
  await setInvoiceFile(orderId, path);

  order = (await getOrder(orderId)) ?? order;
  return order;
}

/** Octets du PDF, en émettant la facture au passage si elle ne l'a pas encore été. */
export async function readInvoicePdf(orderId: string): Promise<{ order: Order; bytes: Buffer } | null> {
  const order = await issueInvoice(orderId);
  if (!order.invoice?.storagePath) return null;
  const [bytes] = await storage().bucket().file(order.invoice.storagePath).download();
  return { order, bytes };
}
