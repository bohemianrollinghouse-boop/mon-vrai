import "server-only";
import { NewsletterSubscriber } from "@/lib/domain/types";
import { col, now, parseQuery } from "./helpers";
import { listCustomers } from "./customers";
import { listOrders } from "./orders";

/*
 * Newsletter : le contenu éditable (un document), la liste des inscrits (collection
 * `newsletter` des inscriptions directes + clients ayant coché la newsletter), et la
 * résolution des audiences (tout le monde, acheteurs d'un titre, une seule adresse).
 */

const content = () => col("content");
const subs = () => col("newsletter");

export type Subscriber = { email: string; name: string; source: string; subscribedAt: number };

/*
 * Contenu des modèles : un document `content/newsletter` porte les valeurs éditées de
 * chaque modèle, sous `values.<idDuModèle>`. Éditer un modèle ne touche pas les autres.
 */
type StoredValues = { values?: Record<string, Record<string, string>> };

export async function getTemplateValues(id: string): Promise<Record<string, string>> {
  const snap = await content().doc("newsletter").get();
  const data = snap.data() as StoredValues | undefined;
  return data?.values?.[id] ?? {};
}

export async function getAllTemplateValues(): Promise<Record<string, Record<string, string>>> {
  const snap = await content().doc("newsletter").get();
  const data = snap.data() as StoredValues | undefined;
  return data?.values ?? {};
}

export async function saveTemplateValues(id: string, values: Record<string, string>): Promise<void> {
  await content().doc("newsletter").set({ values: { [id]: values }, updatedAt: now() }, { merge: true });
}

/** Inscrits, dédupliqués par e-mail : inscriptions directes (opt-in) + clients ayant consenti. */
export async function listSubscribers(): Promise<Subscriber[]> {
  const [direct, customers] = await Promise.all([parseQuery(NewsletterSubscriber, subs().limit(5000)), listCustomers(5000)]);
  const map = new Map<string, Subscriber>();
  for (const s of direct) {
    if (!s.optIn) continue;
    map.set(s.email.toLowerCase(), { email: s.email.toLowerCase(), name: "", source: s.source, subscribedAt: s.subscribedAt });
  }
  for (const c of customers) {
    if (!c.newsletter?.optIn) continue;
    const email = c.email.toLowerCase();
    const existing = map.get(email);
    map.set(email, { email, name: c.name || existing?.name || "", source: existing?.source ?? "compte", subscribedAt: existing?.subscribedAt || c.newsletter.at });
  }
  return [...map.values()].sort((a, b) => b.subscribedAt - a.subscribedAt);
}

/** Désabonne une adresse : inscription directe passée en opt-out, et clients correspondants. */
export async function setNewsletterOptOut(email: string): Promise<void> {
  const lower = email.trim().toLowerCase();
  await subs().doc(encodeURIComponent(lower)).set({ email: lower, optIn: false, source: "unsubscribe", subscribedAt: now() }, { merge: true }).catch(() => undefined);
  const snap = await col("customers").where("email", "==", lower).limit(20).get().catch(() => null);
  if (snap) await Promise.all(snap.docs.map((d) => d.ref.update({ "newsletter.optIn": false, "newsletter.at": now() }).catch(() => undefined)));
}

/** E-mails (en minuscules) ayant commandé un produit donné (commandes réelles, non annulées). */
export async function buyerEmailsByProduct(): Promise<Map<string, Set<string>>> {
  const orders = await listOrders({ limit: 5000 });
  const map = new Map<string, Set<string>>();
  for (const o of orders) {
    if (o.status === "pending_payment" || o.status === "cancelled") continue;
    const email = o.email.toLowerCase();
    for (const l of o.lines) {
      if (!map.has(l.productSlug)) map.set(l.productSlug, new Set());
      map.get(l.productSlug)!.add(email);
    }
  }
  return map;
}

export type Audience = { kind: "all" } | { kind: "product"; slug: string } | { kind: "buyers" } | { kind: "one"; email: string };

/** Destinataires finaux : toujours des inscrits (opt-in), filtrés selon l'audience choisie. */
export async function resolveAudience(audience: Audience): Promise<Subscriber[]> {
  if (audience.kind === "one") {
    const all = await listSubscribers();
    const found = all.find((s) => s.email === audience.email.toLowerCase());
    return found ? [found] : [{ email: audience.email.toLowerCase(), name: "", source: "test", subscribedAt: now() }];
  }
  const subscribers = await listSubscribers();
  if (audience.kind === "all") return subscribers;
  const byProduct = await buyerEmailsByProduct();
  if (audience.kind === "buyers") {
    const buyers = new Set<string>();
    for (const set of byProduct.values()) for (const e of set) buyers.add(e);
    return subscribers.filter((s) => buyers.has(s.email));
  }
  const set = byProduct.get(audience.slug) ?? new Set<string>();
  return subscribers.filter((s) => set.has(s.email));
}
