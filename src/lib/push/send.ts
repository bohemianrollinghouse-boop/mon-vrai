import "server-only";
import webpush from "web-push";
import type { Order } from "@/lib/domain/types";
import { deletePushSubscription, getPushSubscription, listPushSubscriptionsFor, type PushEvent } from "@/lib/db/push";

/*
 * Envoi des notifications push (Web Push / VAPID). Configuré paresseusement à partir des
 * clés VAPID (publique en env, privée en secret). Si les clés manquent, l'envoi est ignoré
 * proprement. Un abonnement mort (404/410) est supprimé au passage.
 */

let ready: boolean | null = null;
function configure(): boolean {
  if (ready !== null) return ready;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contact@monvrai.fr";
  if (!publicKey || !privateKey) {
    ready = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  ready = true;
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Envoie une notification à tous les abonnés d'un type d'évènement. Renvoie le nombre d'envois. */
export async function sendPush(event: PushEvent, payload: PushPayload): Promise<{ sent: number; skipped: boolean }> {
  if (!configure()) return { sent: 0, skipped: true };
  const subs = await listPushSubscriptionsFor(event);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await deletePushSubscription(s.endpoint);
      }
    }),
  );
  return { sent, skipped: false };
}

/** Envoie une notification de test à un seul abonnement (le navigateur qui la demande). */
export async function sendTest(endpoint: string): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!configure()) return { ok: false, skipped: true };
  const sub = await getPushSubscription(endpoint);
  if (!sub) return { ok: false };
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: "Test · Mon Vrai Admin", body: "Les notifications push fonctionnent 🎉", url: "/admin" }));
    return { ok: true };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await deletePushSubscription(endpoint);
    return { ok: false };
  }
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Notifie l'admin d'une nouvelle commande payée. Silencieux en cas d'échec. */
export async function notifyNewOrder(order: Order): Promise<void> {
  const books = order.lines.reduce((s, l) => s + l.qty, 0);
  await sendPush("newOrder", {
    title: "Nouvelle commande",
    body: `${order.number} · ${euros(order.totals.total)} € · ${books} livre${books > 1 ? "s" : ""} · ${order.shippingAddress.name}`,
    url: `/admin/commandes/${order.id}`,
    tag: `order-${order.id}`,
  }).catch(() => undefined);
}
