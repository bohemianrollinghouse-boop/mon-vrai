import "server-only";
import { getCustomer, updateCustomer } from "@/lib/db/customers";
import { addOrderNote, getOrder, setTiime } from "@/lib/db/orders";
import { storeInvoice } from "@/lib/invoice/issue";
import type { InvoiceData } from "@/lib/invoice/pdf";
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

  // Réponse du scénario : { "tiime_client_id": 12973278, "invoice_id": "25892919",
  // "invoice_number": "F2026-0042", "invoice_data": { issue_date, due_date, total_ht,
  // total_ttc, vat_amount } }. L'identifiant client n'est renvoyé que lorsqu'il vient
  // d'être créé ; le reste, à chaque facturation. On génère la facture PDF (maquette
  // Mon Vrai) avec le numéro et les données de Tiime.
  let tiimeClientId: number | undefined;
  let invoiceId: string | undefined;
  let invoiceNumber: string | undefined;
  let invoiceData: InvoiceData | undefined;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    tiimeClientId = asInt(json.tiime_client_id ?? json.tiimeClientId);
    invoiceId = asString(json.invoice_id ?? json.invoiceId);
    invoiceNumber = asString(json.invoice_number ?? json.invoiceNumber ?? json.invoice_no ?? json.number);
    invoiceData = parseInvoiceData(json.invoice_data ?? json.invoiceData);
  } catch {
    // Réponse en texte (« Accepted ») : rien à mémoriser.
  }
  if (tiimeClientId !== undefined && order.customerUid && customer && customer.tiimeClientId !== tiimeClientId) {
    await updateCustomer(order.customerUid, { tiimeClientId }).catch(() => undefined);
  }
  if (invoiceId || tiimeClientId !== undefined) {
    await setTiime(orderId, { clientId: tiimeClientId ?? customer?.tiimeClientId, invoiceId: invoiceId ?? order.tiime?.invoiceId, at: Date.now() }).catch(() => undefined);
  }

  // Génération de la facture PDF (téléchargeable par le client, l'admin, jointe à l'e-mail).
  let invoiceStored = false;
  if (invoiceNumber) {
    try {
      await storeInvoice(order, { number: invoiceNumber, issuedAt: invoiceData?.issueDate ?? Date.now(), data: invoiceData });
      invoiceStored = true;
    } catch (err) {
      await addOrderNote(orderId, `Facture PDF non générée : ${(err as Error).message}`, by).catch(() => undefined);
    }
  }

  await addOrderNote(orderId, `Facturée dans Tiime via Make${invoiceNumber || invoiceId ? ` (facture ${invoiceNumber || invoiceId})` : ""}${invoiceStored ? " · PDF émis" : ""}${tiimeClientId !== undefined ? ` · client Tiime ${tiimeClientId} créé` : ""}`, by).catch(() => undefined);
  return { ok: true, status: res.status, body: body.slice(0, 500), tiimeClientId, invoiceId };
}

function asString(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

const toCents = (euros: number | undefined): number | undefined => (euros === undefined ? undefined : Math.round(euros * 100));
const toTs = (s: unknown): number | undefined => {
  if (typeof s !== "string" || !s.trim()) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
};

/** Données de facture renvoyées par Tiime (montants en euros → centimes, dates → ms). */
function parseInvoiceData(raw: unknown): InvoiceData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  return {
    issueDate: toTs(d.issue_date ?? d.issueDate),
    dueDate: toTs(d.due_date ?? d.dueDate),
    totalHt: toCents(asNum(d.total_ht ?? d.totalHt)),
    totalTtc: toCents(asNum(d.total_ttc ?? d.totalTtc)),
    vatAmount: toCents(asNum(d.vat_amount ?? d.vatAmount)),
  };
}

function asInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
}
