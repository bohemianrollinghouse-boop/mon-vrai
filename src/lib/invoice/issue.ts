import "server-only";
import { storage } from "@/lib/firebase/admin";
import { getOrder, setInvoiceDoc } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";
import type { Order } from "@/lib/domain/types";
import { renderInvoicePdf, type InvoiceMeta } from "./pdf";

/*
 * Émission de la facture : on génère le PDF (maquette « Mon Vrai - Facture ») à partir de
 * la commande et des données renvoyées par Tiime via Make (numéro, dates, totaux), on le
 * dépose dans un dossier privé du bucket et on le rattache à la commande. Le numéro de
 * facture est celui de Tiime - la comptabilité reste la source des numéros. Un PDF déjà
 * déposé pour une commande est écrasé si on refacture (le fichier reste au même chemin).
 */

function storagePathFor(order: Order, at: number): string {
  const year = new Date(at).getFullYear();
  return `invoices/${year}/${order.id}.pdf`;
}

/** Génère la facture, la dépose et la rattache à la commande (numéro Tiime + chemin). */
export async function storeInvoice(order: Order, meta: InvoiceMeta): Promise<Order> {
  const settings = await getSettings();
  const bytes = await renderInvoicePdf(order, settings, meta);
  const filePath = order.invoice?.storagePath ?? storagePathFor(order, meta.issuedAt);
  await storage()
    .bucket()
    .file(filePath)
    .save(Buffer.from(bytes), { contentType: "application/pdf", metadata: { cacheControl: "private, max-age=0" } });
  await setInvoiceDoc(order.id, { number: meta.number, issuedAt: meta.issuedAt, storagePath: filePath });
  return (await getOrder(order.id)) ?? order;
}

/** Octets du PDF de facture stocké, ou null si la commande n'en a pas encore. */
export async function readInvoicePdf(orderId: string): Promise<{ order: Order; bytes: Buffer } | null> {
  const order = await getOrder(orderId);
  if (!order?.invoice?.storagePath) return null;
  const [bytes] = await storage().bucket().file(order.invoice.storagePath).download();
  return { order, bytes };
}
