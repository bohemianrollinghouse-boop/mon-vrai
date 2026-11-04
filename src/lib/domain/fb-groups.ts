import { z } from "zod";
import { dayKey, deviceKind, lastDays, type DeviceKind } from "@/lib/stats/keys";
import { slugify } from "./slug";

/*
 * Campagnes Facebook : les groupes où l'on présente Mon Vrai, le message rédigé pour
 * chacun, et les clics que son lien de suivi a rapportés.
 *
 * Repris du gestionnaire de groupes de COBA, avec deux différences qui dessinent tout
 * le reste :
 *  — il n'y a PAS de message type. Claude (dans Chrome) rédige un message pour chaque
 *    groupe, d'après son règlement et son ton, et l'enregistre par l'API. Le texte
 *    porte `{lien}` là où ira le lien : c'est le serveur qui le remplace, au moment où
 *    l'on copie ou affiche le message, par le lien propre au groupe ;
 *  — le lien de suivi n'est pas une redirection mais une vraie page du site, portant
 *    `?fb=<slug>`. Le clic est compté par la balise de fréquentation, c'est-à-dire
 *    par du JavaScript exécuté dans le navigateur : le robot d'aperçu de Facebook, qui
 *    vient lire la page dès qu'un lien est posté, ne l'exécute pas et ne compte donc
 *    jamais. C'était LE piège de COBA (trois « clics » par publication avant qu'un
 *    humain l'ait vue) ; ici il ne peut pas se produire. Et derrière App Hosting,
 *    l'en-tête User-Agent arrive réécrit : une redirection côté serveur n'aurait même
 *    pas su reconnaître un robot.
 *
 * Tout est pur ici : rien ne lit la base. `db/fb-groups.ts` lit et écrit, l'API et
 * l'écran ne font qu'appeler.
 */

/* ---------- Le groupe ---------- */

/** Onglets : à faire, fait, ignoré, refusé (adhésion refusée, ou post retiré par un admin du groupe). */
export const FB_TABS = ["new", "handled", "ignored", "refused"] as const;
export type FbTab = (typeof FB_TABS)[number];

/** Notre adhésion : pas demandée, en attente d'un admin du groupe, acceptée. */
export const FB_MEMBERSHIPS = ["none", "pending", "validated"] as const;
export type FbMembership = (typeof FB_MEMBERSHIPS)[number];

/** Le post publié : en attente de modération, validé, supprimé par un admin du groupe. */
export const FB_POST_STATES = ["pending", "validated", "deleted"] as const;
export type FbPostState = (typeof FB_POST_STATES)[number];

export const FB_LINK_MARK = "{lien}";
export const FB_MESSAGE_MAX = 5000;
export const FB_NOTE_MAX = 500;

/* ---------- Le relevé du post ---------- */

/*
 * Ce que le script Tampermonkey de COBA relève sur la page du post, dans le navigateur
 * de Steve : Facebook ne sert rien de tout cela à un serveur, et automatiser un compte
 * pour le lire serait exactement ce qu'on s'interdit. Le script est LE MÊME que celui
 * de COBA (servi par l'admin de COBA, autorisé sur monvrai.fr/admin) : la page lui
 * passe la liste des posts par `postMessage`, il ouvre chacun dans un onglet, le lit,
 * et rend le relevé à la page, qui l'enregistre.
 */
export const FB_SCAN_STATES = ["pending", "validated", "unavailable", "unknown"] as const;
export type FbScanState = (typeof FB_SCAN_STATES)[number];

export const FbScan = z.object({
  state: z.enum(FB_SCAN_STATES),
  /** Null quand la page ne l'a pas affiché (post en attente, illisible) : « — » vaut mieux qu'un faux zéro. */
  likes: z.number().int().nonnegative().nullable(),
  comments: z.number().int().nonnegative().nullable(),
  at: z.number(),
  /** Ce que le script a vu, pour comprendre un relevé faux. */
  note: z.string().nullable().default(null),
});
export type FbScan = z.infer<typeof FbScan>;

export const FbGroup = z.object({
  /** Valeur de `?fb=` et identifiant du document : c'est lui qui rattache les clics au groupe. Ne change jamais. */
  slug: z.string().min(1),
  name: z.string().min(1),
  /** Racine canonique `https://www.facebook.com/groups/<id ou alias>`. */
  groupUrl: z.string().min(1),
  status: z.enum(FB_TABS).default("new"),
  membership: z.enum(FB_MEMBERSHIPS).default("pending"),
  /** Nombre de membres relevé par l'agent, s'il l'a vu. */
  members: z.number().int().nonnegative().nullable().default(null),
  /** Le message à poster, avec `{lien}`. Null tant que personne ne l'a rédigé. */
  message: z.string().nullable().default(null),
  messageAt: z.number().nullable().default(null),
  postUrl: z.string().nullable().default(null),
  postStatus: z.enum(FB_POST_STATES).nullable().default(null),
  /** Ce qu'il faut savoir du groupe en une phrase (« pub le samedi seulement »). */
  note: z.string().default(""),
  addedBy: z.enum(["agent", "admin"]).default("agent"),
  /** Dernier relevé du post par le script Tampermonkey. */
  scan: FbScan.nullable().default(null),
  /** Commentaires déjà lus (bouton « Vu ») : le reste s'affiche en « (+x) ». */
  commentsSeen: z.number().int().nonnegative().default(0),
  /**
   * Ce que le script a vu sur la page au dernier relevé, pour corriger ses règles de
   * lecture quand Facebook change sa page. À part du relevé : l'écran ne l'affiche pas.
   */
  scanDiag: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type FbGroup = z.infer<typeof FbGroup>;

/*
 * Le réglage de l'écran : la clé de l'API et la page où mène le lien de suivi.
 *
 * La clé est gardée EN CLAIR, et c'est délibéré : elle doit pouvoir se recopier à tout
 * moment (dans le prompt, notamment) sans qu'on en recrée une à chaque passage. Elle
 * n'ouvre que cette API — lister, ajouter et suivre des groupes, rien d'autre —, elle
 * vit dans un document que seul le serveur lit, et elle se révoque d'un clic.
 */
export const FbGroupsConfig = z.object({
  apiKey: z.string().nullable().default(null),
  keyCreatedAt: z.number().nullable().default(null),
  /** Chemin du site où mène le lien de suivi (`/`, `/catalogue`…). */
  landingPath: z.string().default("/"),
  updatedAt: z.number().default(0),
});
export type FbGroupsConfig = z.infer<typeof FbGroupsConfig>;
export const EMPTY_FB_CONFIG: FbGroupsConfig = FbGroupsConfig.parse({});

/* ---------- Adresses ---------- */

/**
 * La racine `https://www.facebook.com/groups/<id>` d'un lien de groupe (page, post,
 * « À propos »…), ou null si ce n'est pas un lien de groupe Facebook.
 */
export function groupRoot(url: string): string | null {
  try {
    const u = new URL(String(url ?? "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/groups\/([^/?#]+)/);
    if (!m || m[1] === "feed" || m[1] === "discover" || m[1] === "joins") return null;
    return `https://www.facebook.com/groups/${m[1]}`;
  } catch {
    return null;
  }
}

/** Le slug d'un groupe d'après son nom, à défaut d'après l'identifiant de son adresse. 60 caractères au plus. */
export function groupSlug(name: string, groupUrl: string): string {
  const fromName = slugify(name).slice(0, 60).replace(/-+$/, "");
  if (fromName) return fromName;
  return slugify(groupUrl.split("/").pop() ?? "").slice(0, 60) || "groupe";
}

/** Le même nom, quelle que soit la casse, l'accentuation ou la ponctuation. */
export function sameName(a: string, b: string): boolean {
  const ka = slugify(a);
  return ka !== "" && ka === slugify(b);
}

/** Un chemin interne acceptable comme page d'arrivée, ou null. */
export function landingPathFrom(raw: string): string | null {
  const p = String(raw ?? "").trim() || "/";
  if (!p.startsWith("/") || p.startsWith("//") || /[\s?#\\]/.test(p) || p.length > 120) return null;
  if (p.startsWith("/admin") || p.startsWith("/api")) return null;
  return p;
}

/** Le lien de suivi du groupe : la page d'arrivée, avec `?fb=<slug>`. */
export function trackingLink(siteUrl: string, landingPath: string, slug: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const path = landingPathFrom(landingPath) ?? "/";
  return `${base}${path}?fb=${encodeURIComponent(slug)}`;
}

/** Le message prêt à poster : chaque `{lien}` remplacé par le lien du groupe. */
export function fillMessage(text: string, link: string): string {
  return text.split(FB_LINK_MARK).join(link);
}

/**
 * Valide un message reçu (de l'API ou de l'écran). Sans `{lien}`, aucun clic ne serait
 * attribué au groupe : on le refuse plutôt que de le découvrir à la lecture des
 * chiffres. Une adresse monvrai.fr écrite en dur aurait le même effet.
 */
export function checkMessage(raw: string, siteHost = "monvrai.fr"): { ok: true; text: string } | { ok: false; error: string } {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, error: "message vide" };
  if (text.length > FB_MESSAGE_MAX) return { ok: false, error: `message trop long (${FB_MESSAGE_MAX} caractères au plus)` };
  if (!text.includes(FB_LINK_MARK)) return { ok: false, error: "le message doit contenir {lien} là où ira le lien de suivi du groupe" };
  const host = siteHost.replace(/^www\./, "").replace(/\./g, "\\.");
  if (new RegExp(`(https?://)?(www\\.)?${host}`, "i").test(text)) {
    return { ok: false, error: "n'écris pas l'adresse du site toi-même : mets {lien}, le serveur y place le lien de suivi du groupe" };
  }
  return { ok: true, text };
}

/** Un lien de post Facebook acceptable, ou null pour « pas de post ». Lève si l'adresse n'est pas de Facebook. */
export function postUrlFrom(raw: string | null | undefined): string | null {
  const url = String(raw ?? "").trim();
  if (!url) return null;
  if (!/^https:\/\/([a-z]+\.)?facebook\.com\//i.test(url)) throw new Error("le lien du post doit être un lien facebook.com");
  return url.slice(0, 400);
}

/* ---------- Changer l'état d'un groupe ---------- */

export type FbGroupPatch = Partial<Pick<FbGroup, "status" | "membership" | "postUrl" | "postStatus" | "note" | "members" | "name">> & {
  message?: string | null;
};

/**
 * Applique une modification, avec les deux règles qui évitent les gestes inutiles :
 * un premier lien de post part « en attente » (c'est le cas de presque tous les groupes
 * modérés), et fait passer un groupe « à faire » dans « fait » — y avoir posté, c'est
 * l'avoir fait. Retirer le lien retire son état.
 */
export function applyPatch(current: FbGroup, patch: FbGroupPatch, at: number): FbGroup {
  const next: FbGroup = { ...current, updatedAt: at };
  if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 150) || current.name;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.membership !== undefined) next.membership = patch.membership;
  if (patch.members !== undefined) next.members = patch.members;
  if (patch.note !== undefined) next.note = patch.note.trim().slice(0, FB_NOTE_MAX);
  if (patch.message !== undefined) {
    next.message = patch.message;
    next.messageAt = patch.message === null ? null : at;
  }
  if (patch.postUrl !== undefined) {
    next.postUrl = patch.postUrl;
    // Un autre post (ou plus de post) : le relevé et les commentaires lus étaient ceux de l'ancien.
    if (patch.postUrl !== current.postUrl) Object.assign(next, { scan: null, scanDiag: null, commentsSeen: 0 });
    if (!patch.postUrl) next.postStatus = null;
    else if (!current.postUrl) {
      next.postStatus = patch.postStatus ?? "pending";
      if (patch.status === undefined && current.status === "new") next.status = "handled";
    }
  }
  if (patch.postStatus !== undefined && next.postUrl) next.postStatus = patch.postStatus;
  return next;
}

/* ---------- Relevés ---------- */

/** Valide un relevé rendu par le script (donc venu du navigateur : rien n'y est cru tel quel). */
export function scanFrom(raw: unknown, at: number): { scan: FbScan; finalUrl: string | null; diag: string | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const state = (FB_SCAN_STATES as readonly string[]).includes(String(r.state)) ? (r.state as FbScanState) : "unknown";
  const count = (v: unknown): number | null => {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 ? null : Math.floor(n);
  };
  const finalUrl = String(r.finalUrl ?? "");
  return {
    scan: { state, likes: count(r.likes), comments: count(r.comments), at, note: r.note ? String(r.note).slice(0, 500) : null },
    finalUrl: /^https:\/\/(www|web)\.facebook\.com\/groups\/[^/]+\/posts\/\d+/.test(finalUrl) ? finalUrl.split(/[?#]/)[0] : null,
    diag: r.diag ? String(r.diag).slice(0, 3000) : null,
  };
}

/**
 * Applique un relevé. Un état lu (en attente, validé) remplace celui saisi à la main :
 * c'est la page de Facebook qui fait foi, et « introuvable » veut dire supprimé par un
 * admin du groupe. Un post en attente qui a été validé change d'adresse
 * (`pending_posts/…` → `posts/…`) : on garde la nouvelle. Un relevé illisible ne touche
 * qu'au relevé lui-même.
 */
export function applyScan(g: FbGroup, read: ReturnType<typeof scanFrom>): FbGroup {
  const next: FbGroup = { ...g, scan: read.scan, scanDiag: read.diag, updatedAt: read.scan.at };
  if (!g.postUrl) return next;
  if (read.scan.state === "pending" || read.scan.state === "validated") next.postStatus = read.scan.state;
  if (read.scan.state === "unavailable") next.postStatus = "deleted";
  if (read.finalUrl && /\/pending_posts\//.test(g.postUrl)) next.postUrl = read.finalUrl;
  return next;
}

/** Les commentaires arrivés depuis le dernier « Vu ». */
export function newComments(g: Pick<FbGroup, "scan" | "commentsSeen">): number {
  return Math.max(0, (g.scan?.comments ?? 0) - g.commentsSeen);
}

export const SCAN_LABELS: Record<FbScanState, string> = { pending: "En attente", validated: "Validé", unavailable: "Supprimé", unknown: "Illisible" };

/* ---------- Robots ---------- */

/*
 * Robots d'aperçu et clients non navigateurs, repris de COBA (`estRobotDApercu`). En
 * pratique ils n'atteignent jamais le compteur — ils n'exécutent pas la balise —, mais
 * un navigateur piloté qui le ferait doit être écarté. Un faux positif ne coûte qu'un
 * clic non compté ; un faux négatif rend le compteur inutilisable.
 */
const PREVIEW_BOTS = new RegExp(
  [
    "facebookexternalhit", "facebookcatalog", "facebot", "meta-externalagent",
    "twitterbot", "linkedinbot", "slackbot", "slack-imgproxy", "discordbot",
    "telegrambot", "whatsapp", "skypeuripreview", "vkshare", "redditbot",
    "pinterestbot", "embedly", "iframely", "snapchat", "viber",
    "googlebot", "google-inspectiontool", "bingbot", "applebot", "duckduckbot",
    "yandexbot", "baiduspider", "petalbot", "ahrefsbot", "semrushbot", "mj12bot", "dotbot",
    "\\bbot\\b", "crawler", "spider", "preview", "scraper", "monitoring", "lighthouse",
    "curl/", "wget/", "python-requests", "go-http-client", "axios/", "node-fetch",
    "headlesschrome", "phantomjs", "puppeteer", "playwright",
  ].join("|"),
  "i",
);

/** Ce navigateur est-il un robot ? Un User-Agent absent ou trop court l'est par principe. */
export function isRobot(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").trim();
  if (ua.length < 20) return true;
  return PREVIEW_BOTS.test(ua);
}

/* ---------- Un clic ---------- */

/*
 * Deux clics du même visiteur sur le même groupe à moins de 30 s n'en font qu'un :
 * navigateur intégré de Facebook qui précharge, puis passage au navigateur du système.
 * Valeur mesurée sur COBA (les doublons s'y groupent sous 10 s, avec une queue jusqu'à
 * 30 s ; au-delà, ce sont de vraies visites).
 */
export const DUPLICATE_WINDOW_MS = 30_000;

export const FB_CLICK_KINDS = ["human", "bot", "duplicate"] as const;
export type FbClickKind = (typeof FB_CLICK_KINDS)[number];

/*
 * Un clic tel qu'on l'enregistre. Ni adresse IP, ni cookie : le visiteur n'est qu'une
 * empreinte du jour (sel + jour + identifiant tiré au sort par le navigateur + groupe),
 * qui ne sert qu'à reconnaître un doublon et ne suit personne d'un jour à l'autre.
 *
 * Robots et doublons sont GARDÉS, marqués : quand le compteur et la réalité divergent,
 * c'est là qu'on va voir pourquoi.
 */
export const FbClick = z.object({
  group: z.string(),
  at: z.number(),
  kind: z.enum(FB_CLICK_KINDS),
  visitor: z.string().nullable().default(null),
  /** Hôte du référent, regroupé par famille (`facebook.com`), ou null en accès direct. */
  refererHost: z.string().nullable().default(null),
  referer: z.string().nullable().default(null),
  device: z.enum(["mobile", "tablette", "ordinateur"]).default("ordinateur"),
  os: z.string().default("inconnu"),
  browser: z.string().default("inconnu"),
  path: z.string().default("/"),
});
export type FbClick = z.infer<typeof FbClick>;

/**
 * Le navigateur, tel qu'on veut le lire dans un tableau.
 *
 * L'ORDRE COMPTE : le navigateur intégré de Facebook annonce aussi « Safari », Edge
 * annonce « Chrome », Chrome annonce « Safari ». Du plus précis au plus générique, sans
 * quoi tous les clics venus de Facebook se rangeraient sous « Safari » — c'est-à-dire
 * qu'on perdrait exactement l'information cherchée.
 */
export function browserFromUa(ua: string): string {
  const u = String(ua ?? "");
  if (!u) return "inconnu";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(u)) return "Facebook (intégré)";
  if (/Instagram/i.test(u)) return "Instagram (intégré)";
  if (/Messenger/i.test(u)) return "Messenger (intégré)";
  if (/TikTok|musical_ly|BytedanceWebview/i.test(u)) return "TikTok (intégré)";
  if (/GSA\//i.test(u)) return "Google App";
  if (/\bEdgA?\/|\bEdgiOS\//i.test(u)) return "Edge";
  if (/\bOPR\/|\bOpera/i.test(u)) return "Opera";
  if (/SamsungBrowser/i.test(u)) return "Samsung Internet";
  if (/\bFirefox\/|\bFxiOS\//i.test(u)) return "Firefox";
  if (/\bCriOS\/|\bChrome\//i.test(u)) return "Chrome";
  if (/\bSafari\//i.test(u)) return "Safari";
  return "autre";
}

/** Le système. L'iPad avant le Mac : en mode bureau, un iPad annonce « Macintosh ». */
export function osFromUa(ua: string): string {
  const u = String(ua ?? "");
  if (!u) return "inconnu";
  if (/\biPad\b/i.test(u) || (/Macintosh/i.test(u) && /Mobile\//i.test(u))) return "iPadOS";
  if (/\biPhone\b|\biPod\b/i.test(u)) return "iOS";
  if (/\bAndroid\b/i.test(u)) return "Android";
  if (/\bWindows\b/i.test(u)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(u)) return "macOS";
  if (/\bLinux\b|X11/i.test(u)) return "Linux";
  return "autre";
}

/*
 * Facebook renvoie selon les cas `l.facebook.com`, `m.facebook.com`, `lm.facebook.com`
 * ou `web.facebook.com` : quatre lignes pour une seule réalité. On les réunit, sans quoi
 * aucune ne pèse assez pour dire quoi que ce soit.
 */
const FAMILIES: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.(me|com|watch)$/i, "facebook.com"],
  [/(^|\.)messenger\.com$/i, "messenger.com"],
  [/(^|\.)instagram\.com$/i, "instagram.com"],
  [/(^|\.)(google\.[a-z.]+|googleadservices\.com)$/i, "google"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/i, "x.com"],
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/i, "whatsapp.com"],
];

/** L'hôte d'où vient le clic, regroupé par famille ; null en accès direct ou depuis le site lui-même. */
export function refererFamily(referer: string | null | undefined, siteHost: string): string | null {
  const raw = String(referer ?? "").trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || host.replace(/^www\./, "") === siteHost.toLowerCase().replace(/^www\./, "")) return null;
  if (host === "localhost" || host === "127.0.0.1") return null;
  for (const [re, family] of FAMILIES) if (re.test(host)) return family;
  return host.replace(/^www\./, "").slice(0, 80);
}

/** Ce qu'on retient d'un User-Agent. */
export function describeUa(ua: string): { device: DeviceKind; os: string; browser: string } {
  return { device: deviceKind(ua), os: osFromUa(ua), browser: browserFromUa(ua) };
}

/** Le clic précédent du même visiteur sur le même groupe date-t-il de moins de 30 s ? */
export function isDuplicate(previousAt: number[], at: number): boolean {
  return previousAt.some((t) => at - t >= 0 && at - t < DUPLICATE_WINDOW_MS);
}

/* ---------- Agréger ---------- */

export type FbGroupStats = { clicks: number; last7: number; last: number | null };
export const NO_STATS: FbGroupStats = { clicks: 0, last7: 0, last: null };

/** Les clics humains par groupe, pour la liste : total, 7 derniers jours, dernier. */
export function statsByGroup(clicks: Pick<FbClick, "group" | "kind" | "at">[], now: number): Record<string, FbGroupStats> {
  const since = now - 7 * 86_400_000;
  const out: Record<string, FbGroupStats> = {};
  for (const c of clicks) {
    if (c.kind !== "human") continue;
    const s = (out[c.group] ??= { clicks: 0, last7: 0, last: null });
    s.clicks++;
    if (c.at >= since) s.last7++;
    if (s.last === null || c.at > s.last) s.last = c.at;
  }
  return out;
}

export type Ranked = { key: string; clicks: number };
export type FbMetrics = {
  humans: number;
  robots: number;
  duplicates: number;
  /** Un point par jour (heure de Paris), du plus ancien au plus récent, jours sans clic compris. */
  byDay: { day: string; clicks: number }[];
  /** Provenances, chacune dépliable sur les adresses exactes qui la composent. */
  byReferer: (Ranked & { urls: { url: string; clicks: number }[] })[];
  byBrowser: Ranked[];
  byOs: Ranked[];
  byDevice: Ranked[];
  byPage: Ranked[];
  first: number | null;
  last: number | null;
};

function rank(values: string[]): Ranked[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([key, clicks]) => ({ key, clicks })).sort((a, b) => b.clicks - a.clicks || a.key.localeCompare(b.key, "fr"));
}

export const DIRECT_KEY = "(direct)";

/**
 * Le détail d'un groupe, à la manière du détail des campagnes de COBA. Robots et
 * doublons sont comptés à part et EXCLUS de tous les classements.
 *
 * La série par jour est REMPLIE : un jour sans clic vaut zéro. Une courbe qui saute les
 * jours creux ment sur le rythme — trois clics étalés sur trois semaines y prendraient
 * l'allure d'une campagne régulière.
 */
export function aggregateClicks(clicks: FbClick[], days: number, now: number): FbMetrics {
  const humans = clicks.filter((c) => c.kind === "human");
  const perDay = new Map<string, number>();
  for (const c of humans) perDay.set(dayKey(c.at), (perDay.get(dayKey(c.at)) ?? 0) + 1);

  const refs = new Map<string, Map<string, number>>();
  for (const c of humans) {
    const key = c.refererHost ?? DIRECT_KEY;
    const url = c.referer?.trim() || "(sans détail)";
    const urls = refs.get(key) ?? new Map<string, number>();
    urls.set(url, (urls.get(url) ?? 0) + 1);
    refs.set(key, urls);
  }

  const times = humans.map((c) => c.at).sort((a, b) => a - b);
  return {
    humans: humans.length,
    robots: clicks.filter((c) => c.kind === "bot").length,
    duplicates: clicks.filter((c) => c.kind === "duplicate").length,
    byDay: lastDays(now, days).map((day) => ({ day, clicks: perDay.get(day) ?? 0 })),
    byReferer: [...refs.entries()]
      .map(([key, urls]) => ({
        key,
        clicks: [...urls.values()].reduce((a, b) => a + b, 0),
        urls: [...urls.entries()].map(([url, n]) => ({ url, clicks: n })).sort((a, b) => b.clicks - a.clicks || a.url.localeCompare(b.url)),
      }))
      .sort((a, b) => b.clicks - a.clicks || a.key.localeCompare(b.key, "fr")),
    byBrowser: rank(humans.map((c) => c.browser)),
    byOs: rank(humans.map((c) => c.os)),
    byDevice: rank(humans.map((c) => c.device)),
    byPage: rank(humans.map((c) => c.path)),
    first: times[0] ?? null,
    last: times.at(-1) ?? null,
  };
}

/* ---------- La liste ---------- */

/** Les groupes ajoutés aujourd'hui (heure de Paris) par l'agent : la règle du rythme se compte là-dessus. */
export function addedToday(groups: Pick<FbGroup, "createdAt" | "addedBy">[], now: number): number {
  const today = dayKey(now);
  return groups.filter((g) => g.addedBy === "agent" && dayKey(g.createdAt) === today).length;
}

export const TAB_LABELS: Record<FbTab, string> = { new: "À faire", handled: "Fait", ignored: "Ignorés", refused: "Refusés" };
export const MEMBERSHIP_LABELS: Record<FbMembership, string> = { none: "Pas demandée", pending: "En attente", validated: "Membre" };
export const POST_LABELS: Record<FbPostState, string> = { pending: "Post en attente", validated: "Post validé", deleted: "Post supprimé" };

/* ---------- Ce que l'API accepte ---------- */

export const LOT_MAX = 50;

/** Un groupe à ajouter. Le nom est obligatoire : le serveur ne peut pas le lire sur Facebook. */
export const ApiNewGroup = z.object({
  url: z.string().min(1, "url obligatoire"),
  name: z.string().trim().min(1, "name obligatoire : le nom du groupe tel qu'affiché sur Facebook").max(150),
  membership: z.enum(FB_MEMBERSHIPS).optional(),
  members: z.number().int().nonnegative().nullable().optional(),
  message: z.string().nullable().optional(),
  note: z.string().max(FB_NOTE_MAX).optional(),
});
export type ApiNewGroup = z.infer<typeof ApiNewGroup>;

/**
 * Une modification. `strict` : un champ inconnu est refusé et nommé, plutôt qu'ignoré
 * en silence — un agent qui croit avoir changé le slug doit apprendre que non. Le nom
 * et le slug ne se changent pas ici : le slug est dans les liens déjà postés.
 */
export const ApiPatch = z
  .object({
    status: z.enum(FB_TABS),
    membership: z.enum(FB_MEMBERSHIPS),
    members: z.number().int().nonnegative().nullable(),
    postUrl: z.string().nullable(),
    postStatus: z.enum(FB_POST_STATES),
    note: z.string().max(FB_NOTE_MAX),
    message: z.string().nullable(),
  })
  .partial()
  .strict();
export type ApiPatch = z.infer<typeof ApiPatch>;

/** Premier problème d'une validation zod, lisible par l'agent. */
export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return "requête invalide";
  if (i.code === "unrecognized_keys") return `champ non modifiable par l'API : ${i.keys.join(", ")}`;
  const where = i.path.length ? `${i.path.join(".")} : ` : "";
  return `${where}${i.message}`;
}

/**
 * Traduit une modification venue de l'API ou de l'écran en patch applicable : message
 * vérifié (`{lien}` présent), lien de post vérifié. Lève avec un message lisible.
 */
export function toPatch(input: ApiPatch, siteHost: string): FbGroupPatch {
  const patch: FbGroupPatch = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.membership !== undefined) patch.membership = input.membership;
  if (input.members !== undefined) patch.members = input.members;
  if (input.note !== undefined) patch.note = input.note;
  if (input.postUrl !== undefined) patch.postUrl = postUrlFrom(input.postUrl);
  if (input.postStatus !== undefined) patch.postStatus = input.postStatus;
  if (input.message !== undefined) {
    if (input.message === null || input.message.trim() === "") patch.message = null;
    else {
      const checked = checkMessage(input.message, siteHost);
      if (!checked.ok) throw new Error(checked.error);
      patch.message = checked.text;
    }
  }
  return patch;
}
