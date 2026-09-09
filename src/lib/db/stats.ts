import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { DeviceKind } from "@/lib/stats/keys";
import { dayKey } from "@/lib/stats/keys";
import { col, now } from "./helpers";

/*
 * Fréquentation : un document par jour (`stats_days/AAAA-MM-JJ`) qui cumule, par
 * incréments atomiques, les pages vues, les visiteurs (empreintes du jour), les visiteurs
 * par page, les sources et appareils (à l'entrée sur le site), les heures et les ajouts
 * au panier. Et une collection de présence (`stats_presence/<session>`) : qui est sur le
 * site, sur quelle page, venu d'où, sur quel appareil, vu pour la dernière fois quand.
 * Aucune donnée nominative : ni IP, ni cookie, ni compte.
 *
 * Écriture sur un seul document par jour : Firestore conseille une écriture par seconde
 * et par document. Pour une boutique de cette taille c'est très large ; en cas de pic
 * extrême, quelques balises seraient perdues — elles sont indicatives.
 */

const days = () => col("stats_days");
const presence = () => col("stats_presence");

export type DayStats = {
  day: string;
  views: number;
  visitors: number;
  pages: Record<string, number>;
  /** Visiteurs distincts par page (dans la journée). */
  pageVisitors: Record<string, number>;
  /** Visiteurs distincts ayant vu au moins une fiche livre. */
  productVisitors: number;
  /** Visiteurs distincts ayant ajouté au panier. */
  cartVisitors: number;
  /** Visiteurs distincts arrivés sur la page de paiement. */
  checkoutVisitors: number;
  sources: Record<string, number>;
  devices: Record<string, number>;
  hours: Record<string, number>;
  cartHours: Record<string, number>;
};

export type HitInput = {
  day: string;
  hour: string;
  path: string;
  visitor: string;
  /** Renseignés seulement pour la première page vue d'une session (entrée sur le site). */
  entry?: { source: string; device: DeviceKind };
};

export async function recordHit(h: HitInput): Promise<void> {
  const inc = FieldValue.increment(1);
  // set(merge) : les clés d'objet sont prises littéralement (un chemin « /livres/x » reste
  // une seule clé), contrairement à update() qui lirait la notation pointée. Une écriture.
  const data: Record<string, unknown> = {
    day: h.day,
    views: inc,
    updatedAt: now(),
    pages: { [h.path]: inc },
    hours: { [h.hour]: inc },
    visitors: { [h.visitor]: true },
    pv: { [h.path]: { [h.visitor]: true } },
  };
  if (h.entry) {
    data.referrers = { [h.entry.source]: inc };
    data.devices = { [h.entry.device]: inc };
  }
  await days().doc(h.day).set(data, { merge: true });
}

/** Un ajout au panier : compté par heure, et le visiteur retenu pour le parcours d'achat. */
export async function recordCartAdd(day: string, hour: string, visitor: string): Promise<void> {
  await days()
    .doc(day)
    .set({ day, cartHours: { [hour]: FieldValue.increment(1) }, cartVisitors: { [visitor]: true }, updatedAt: now() }, { merge: true });
}

export type PresenceInput = { sessionId: string; path: string; source?: string; device?: DeviceKind };

/** Signale qu'une session est (toujours) sur le site, sur cette page. */
export async function heartbeat(p: PresenceInput): Promise<void> {
  const data: Record<string, unknown> = { path: p.path, lastSeen: now() };
  if (p.source) data.source = p.source;
  if (p.device) data.device = p.device;
  await presence().doc(p.sessionId).set(data, { merge: true });
}

/* ---------- Lecture ---------- */

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, n] of Object.entries(v as Record<string, unknown>)) out[k] = num(n);
  return out;
};
const size = (v: unknown) => (v && typeof v === "object" ? Object.keys(v as object).length : 0);

function toDayStats(id: string, d: Record<string, unknown>): DayStats {
  const pv = (d.pv && typeof d.pv === "object" ? d.pv : {}) as Record<string, Record<string, true>>;
  const pageVisitors: Record<string, number> = {};
  const productSet = new Set<string>();
  for (const [path, set] of Object.entries(pv)) {
    const keys = Object.keys(set ?? {});
    pageVisitors[path] = keys.length;
    if (path.startsWith("/livres/")) keys.forEach((k) => productSet.add(k));
  }
  return {
    day: id,
    views: num(d.views),
    visitors: size(d.visitors),
    pages: numMap(d.pages),
    pageVisitors,
    productVisitors: productSet.size,
    cartVisitors: size(d.cartVisitors),
    checkoutVisitors: pageVisitors["/commande"] ?? 0,
    sources: numMap(d.referrers),
    devices: numMap(d.devices),
    hours: numMap(d.hours),
    cartHours: numMap(d.cartHours),
  };
}

// Les jours écoulés ne changent plus : on les garde en mémoire une heure, pour que le
// rafraîchissement automatique de la page ne relise que le jour courant.
const closedDays = new Map<string, { at: number; stats: DayStats | null }>();
const CLOSED_TTL = 3_600_000;

export async function readDays(keys: string[]): Promise<DayStats[]> {
  if (keys.length === 0) return [];
  const today = dayKey(now());
  const t = now();
  const out = new Map<string, DayStats>();
  const toFetch: string[] = [];
  for (const k of keys) {
    const cached = k !== today ? closedDays.get(k) : undefined;
    if (cached && t - cached.at < CLOSED_TTL) {
      if (cached.stats) out.set(k, cached.stats);
    } else toFetch.push(k);
  }
  if (toFetch.length) {
    const snaps = await days().firestore.getAll(...toFetch.map((k) => days().doc(k)));
    for (const s of snaps) {
      const stats = s.exists ? toDayStats(s.id, s.data() ?? {}) : null;
      if (s.id !== today) closedDays.set(s.id, { at: t, stats });
      if (stats) out.set(s.id, stats);
    }
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export type Present = { sessionId: string; path: string; source: string; device: DeviceKind | ""; lastSeen: number };

/** Sessions vues dans la fenêtre donnée ; purge au passage celles trop anciennes. */
export async function readPresence(windowMs = 300_000): Promise<Present[]> {
  const t = now();
  const [live, stale] = await Promise.all([
    presence().where("lastSeen", ">=", t - windowMs).limit(500).get(),
    presence().where("lastSeen", "<", t - 3_600_000).limit(200).get(),
  ]);
  if (!stale.empty) {
    const batch = presence().firestore.batch();
    stale.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit().catch(() => undefined);
  }
  return live.docs
    .map((d) => {
      const x = d.data();
      const device: Present["device"] = x.device === "mobile" || x.device === "tablette" || x.device === "ordinateur" ? x.device : "";
      return { sessionId: d.id, path: String(x.path ?? ""), source: String(x.source ?? ""), device, lastSeen: num(x.lastSeen) };
    })
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

/*
 * Sel de l'empreinte visiteur. Stable tant qu'un secret serveur existe ; à défaut, un
 * sel par processus (les visiteurs uniques deviennent alors approximatifs entre
 * instances, rien de plus grave).
 */
const processSalt = randomBytes(16).toString("hex");
export function statsSalt(): string {
  return process.env.STATS_SALT || process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || processSalt;
}
