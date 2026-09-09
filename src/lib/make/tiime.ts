import "server-only";
import { getCustomer, updateCustomer } from "@/lib/db/customers";
import { addOrderNote, getOrder, setTiime } from "@/lib/db/orders";
import { storeTiimeInvoice } from "@/lib/invoice/issue";
import { buildTiimePayload } from "./payload";

/*
 * Envoi d'une commande payée au webhook Make (→ Tiime). Jamais bloquant : un Make en
 * panne ne doit pas empêcher une commande d'exister ; l'admin peut renvoyer à la main.
 * Si Make répond avec un `tiime_client_id`, on le mémorise sur le client pour les
 * commandes suivantes. Make attend la clé dans l'en-tête `x-make-apikey`.
 */

export function makeConfigured(): boolean {
  return Boolean(process.env.MAKE_WEBHOOK_URL && process.env.MAKE_WEBHOOK_API_KEY);
}

export type MakeResult = { ok: true; status: number; body: string; tiimeClientId?: number; invoiceId?: string } | { ok: false; error: string };

export async function sendOrderToMake(orderId: string, by = "système"): Promise<MakeResult> {
  const url = process.env.MAKE_WEBHOOK_URL;
  const key = process.env.MAKE_WEBHOOK_API_KEY;
  if (!url || !key) return { ok: false, error: "Make non configuré (MAKE_WEBHOOK_URL / MAKE_WEBHOOK_API_KEY)" };

  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Commande introuvable" };
  const customer = order.customerUid ? await getCustomer(order.customerUid) : null;
  const payload = buildTiimePayload(order, customer);

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-make-apikey": key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    await addOrderNote(orderId, `Make/Tiime injoignable : ${(err as Error).message}`, by).catch(() => undefined);
    return { ok: false, error: `Make injoignable : ${(err as Error).message}` };
  }
  const body = await res.text();
  if (!res.ok) {
    await addOrderNote(orderId, `Make/Tiime a refusé l'envoi (${res.status})`, by).catch(() => undefined);
    return { ok: false, error: `Make a répondu ${res.status}${body ? ` : ${body.slice(0, 200)}` : ""}` };
  }

  // Réponse du scénario : { "tiime_client_id": "12973278", "invoice_id": "25892919",
  // "invoice_number": "F2026-0042", "invoice_pdf": "<base64>" }. L'identifiant client n'est
  // renvoyé que lorsqu'il vient d'être créé ; le reste, à chaque facturation. Le PDF est
  // celui de Tiime : on le dépose et on le rattache à la commande (aucun PDF généré ici).
  let tiimeClientId: number | undefined;
  let invoiceId: string | undefined;
  let invoiceNumber: string | undefined;
  let pdfB64: string | undefined;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    tiimeClientId = asInt(json.tiime_client_id ?? json.tiimeClientId);
    invoiceId = asString(json.invoice_id ?? json.invoiceId);
    invoiceNumber = asString(json.invoice_number ?? json.invoiceNumber ?? json.invoice_no ?? json.number);
    pdfB64 = asString(json.invoice_pdf ?? json.invoicePdf ?? json.invoice_pdf_base64 ?? json.pdf ?? json.pdf_base64);
  } catch {
    // Réponse en texte (« Accepted ») : rien à mémoriser.
  }
  if (tiimeClientId !== undefined && order.customerUid && customer && customer.tiimeClientId !== tiimeClientId) {
    await updateCustomer(order.customerUid, { tiimeClientId }).catch(() => undefined);
  }
  if (invoiceId || tiimeClientId !== undefined) {
    await setTiime(orderId, { clientId: tiimeClientId ?? customer?.tiimeClientId, invoiceId: invoiceId ?? order.tiime?.invoiceId, at: Date.now() }).catch(() => undefined);
  }

  // Dépôt du PDF Tiime : rend la facture téléchargeable (client, e-mail, admin).
  let invoiceStored = false;
  const pdf = pdfB64 ? decodePdf(pdfB64) : null;
  if (pdf) {
    try {
      await storeTiimeInvoice(order, pdf, invoiceNumber || invoiceId || order.number);
      invoiceStored = true;
    } catch (err) {
      await addOrderNote(orderId, `PDF de facture Tiime non stocké : ${(err as Error).message}`, by).catch(() => undefined);
    }
  }

  await addOrderNote(orderId, `Facturée dans Tiime via Make${invoiceNumber || invoiceId ? ` (facture ${invoiceNumber || invoiceId})` : ""}${invoiceStored ? " · PDF récupéré" : ""}${tiimeClientId !== undefined ? ` · client Tiime ${tiimeClientId} créé` : ""}`, by).catch(() => undefined);
  return { ok: true, status: res.status, body: body.slice(0, 500), tiimeClientId, invoiceId };
}

function asString(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Décode un PDF en base64 (avec ou sans préfixe data:), en vérifiant l'en-tête %PDF. */
function decodePdf(b64: string): Buffer | null {
  const clean = b64.includes(",") && b64.startsWith("data:") ? b64.slice(b64.indexOf(",") + 1) : b64;
  try {
    const buf = Buffer.from(clean, "base64");
    return buf.length > 4 && buf.subarray(0, 5).toString("latin1") === "%PDF-" ? buf : null;
  } catch {
    return null;
  }
}

function asInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
}
