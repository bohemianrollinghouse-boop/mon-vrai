import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { col, now } from "./helpers";

/*
 * Abonnements aux notifications push (Web Push) de l'admin. Un document par abonnement
 * navigateur (identifié par le hash de son endpoint), avec l'admin propriétaire et les
 * types d'évènements souhaités (pour l'instant : nouvelles commandes). Écrit et lu
 * uniquement côté serveur, via le SDK Admin.
 */

export const PushSubscription = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  uid: z.string().default(""),
  email: z.string().default(""),
  events: z.object({ newOrder: z.boolean().default(true) }).default({ newOrder: true }),
  createdAt: z.number().default(0),
});
export type PushSubscription = z.infer<typeof PushSubscription>;
export type PushEvent = keyof PushSubscription["events"];

const subs = () => col("pushSubscriptions");
const idOf = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

export async function savePushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string }; uid: string; email: string; events: { newOrder: boolean } }): Promise<void> {
  await subs().doc(idOf(input.endpoint)).set({ ...input, createdAt: now() }, { merge: true });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await subs().doc(idOf(endpoint)).delete().catch(() => undefined);
}

export async function getPushSubscription(endpoint: string): Promise<PushSubscription | null> {
  const snap = await subs().doc(idOf(endpoint)).get();
  if (!snap.exists) return null;
  const parsed = PushSubscription.safeParse(snap.data());
  return parsed.success ? parsed.data : null;
}

export async function listPushSubscriptionsFor(event: PushEvent): Promise<PushSubscription[]> {
  const snap = await subs().where(`events.${event}`, "==", true).limit(500).get();
  return snap.docs.map((d) => PushSubscription.safeParse(d.data())).flatMap((r) => (r.success ? [r.data] : []));
}
