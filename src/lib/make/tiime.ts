import "server-only";
import { getCustomer, updateCustomer } from "@/lib/db/customers";
import { addOrderNote, getOrder, setTiime } from "@/lib/db/orders";
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

  // Réponse du scénario : { "tiime_client_id": "12973278", "invoice_id": "25892919" } — l'identifiant
  // client n'est renvoyé que lorsqu'il vient d'être créé ; l'identifiant de facture, toujours.
  let tiimeClientId: number | undefined;
  let invoiceId: string | undefined;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    tiimeClientId = asInt(json.tiime_client_id ?? json.tiimeClientId);
    const inv = json.invoice_id ?? json.invoiceId;
    if (typeof inv === "number" || (typeof inv === "string" && inv.trim())) invoiceId = String(inv);
  } catch {
    // Réponse en texte (« Accepted ») : rien à mémoriser.
  }
  if (tiimeClientId !== undefined && order.customerUid && customer && customer.tiimeClientId !== tiimeClientId) {
    await updateCustomer(order.customerUid, { tiimeClientId }).catch(() => undefined);
  }
  if (invoiceId || tiimeClientId !== undefined) {
    await setTiime(orderId, { clientId: tiimeClientId ?? customer?.tiimeClientId, invoiceId: invoiceId ?? order.tiime?.invoiceId, at: Date.now() }).catch(() => undefined);
  }
  await addOrderNote(orderId, `Facturée dans Tiime via Make${invoiceId ? ` (facture ${invoiceId})` : ""}${tiimeClientId !== undefined ? ` · client Tiime ${tiimeClientId} créé` : ""}`, by).catch(() => undefined);
  return { ok: true, status: res.status, body: body.slice(0, 500), tiimeClientId, invoiceId };
}

function asInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
}
