import "server-only";
import { getCustomer, updateCustomer } from "@/lib/db/customers";
import { addOrderNote, getOrder } from "@/lib/db/orders";
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

export type MakeResult = { ok: true; status: number; body: string; tiimeClientId?: number } | { ok: false; error: string };

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

  // Réponse facultative : { "tiime_client_id": 123 } (ou tiimeClientId) → mémorisée sur le client.
  let tiimeClientId: number | undefined;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const raw = json.tiime_client_id ?? json.tiimeClientId;
    if (typeof raw === "number" && Number.isInteger(raw)) tiimeClientId = raw;
    else if (typeof raw === "string" && /^\d+$/.test(raw)) tiimeClientId = Number(raw);
  } catch {
    // Make répond souvent « Accepted » en texte : rien à mémoriser.
  }
  if (tiimeClientId !== undefined && order.customerUid && customer && customer.tiimeClientId !== tiimeClientId) {
    await updateCustomer(order.customerUid, { tiimeClientId }).catch(() => undefined);
  }
  await addOrderNote(orderId, `Envoyée à Tiime via Make${tiimeClientId !== undefined ? ` (client Tiime ${tiimeClientId})` : ""}`, by).catch(() => undefined);
  return { ok: true, status: res.status, body: body.slice(0, 500), tiimeClientId };
}
