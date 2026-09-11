import { createHash } from "node:crypto";

/*
 * Statistiques de fréquentation maison, sans cookie ni service tiers. Ce module ne
 * contient que des fonctions pures : clés de jour/heure en heure de Paris, regroupement
 * des chemins en « pages » connues (pour que des URL fantaisistes ne gonflent pas la
 * base), hôte du site référent, détection grossière des robots, et empreinte de visiteur
 * du jour (haché, jamais l'IP en clair) pour compter les visiteurs uniques.
 */

const TZ = "Europe/Paris";

/** « 2026-09-09 » en heure de Paris. */
export function dayKey(ts: number): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}

/** « 14 » : l'heure de Paris, sur deux chiffres. */
export function hourKey(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(ts)).slice(0, 2).padStart(2, "0");
}

/** Les n derniers jours (clé de jour), du plus ancien au plus récent, aujourd'hui compris. */
export function lastDays(now: number, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(now - i * 86_400_000));
  // Le changement d'heure peut produire un doublon : on le retire.
  return [...new Set(out)];
}

export const OTHER_PAGE = "(autre)";

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const EXACT = new Set(["/", "/catalogue", "/recherche", "/panier", "/compte", "/compte/connexion", "/contact", "/informations", "/notre-histoire", "/le-concept", "/commande", "/commande/merci"]);
const PATTERNS = [new RegExp(`^/livres/${SLUG}$`), new RegExp(`^/pages/${SLUG}$`), new RegExp(`^/informations/${SLUG}$`)];

/**
 * Ramène un chemin à une page connue : paramètres et slash final retirés, détail de
 * commande regroupé (l'identifiant est personnel), tout le reste dans « (autre) » —
 * y compris les 404, pour qu'un robot qui balaie des URL n'invente pas des pages.
 */
export function bucketPath(raw: string): string {
  let p = raw.split(/[?#]/)[0].trim();
  if (!p.startsWith("/")) return OTHER_PAGE;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p.length > 160) return OTHER_PAGE;
  if (EXACT.has(p)) return p;
  if (p.startsWith("/compte/commandes/")) return "/compte/commandes";
  if (PATTERNS.some((re) => re.test(p))) return p;
  return OTHER_PAGE;
}

export const DIRECT = "(direct)";

/** Hôte du site référent, sans « www. » ; le site lui-même ou une valeur vide comptent comme accès direct. */
export function referrerHost(referrer: string | undefined | null, siteHost: string): string {
  if (!referrer) return DIRECT;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === siteHost.toLowerCase().replace(/^www\./, "")) return DIRECT;
    if (host === "localhost" || host === "127.0.0.1") return DIRECT;
    return host.slice(0, 80);
  } catch {
    return DIRECT;
  }
}

const BOT = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|headless|lighthouse|pingdom|facebookexternalhit|curl\/|wget\/|python-requests|go-http-client|axios\/|node-fetch|okhttp/i;

/** Détection grossière : suffit pour les robots honnêtes, qui sont de loin les plus nombreux. */
export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 20) return true;
  return BOT.test(userAgent);
}

/**
 * Navigateur à retenir. Derrière App Hosting, l'en-tête User-Agent arrive réécrit en
 * « Google » (constaté dans les journaux Cloud Run) : il ne dit rien du visiteur. On
 * garde l'en-tête s'il ressemble à un vrai navigateur, sinon celui que la balise envoie
 * (navigator.userAgent). Les robots n'exécutent pas la balise : ce choix ne les fait pas
 * entrer, et isBot() écarte les rares qui le feraient.
 */
export function pickUserAgent(headerUa: string | null | undefined, bodyUa: string | null | undefined): string {
  const h = (headerUa ?? "").trim();
  if (h.length >= 20 && /Mozilla|Opera|Safari|Chrome|Firefox/i.test(h)) return h;
  return (bodyUa ?? "").trim().slice(0, 300);
}

/**
 * Empreinte du visiteur pour la journée : sel serveur + jour + identifiant, hachés et
 * tronqués. L'identifiant est celui que la balise tire au sort pour la journée (stockage
 * local du navigateur, renouvelé chaque jour) ou, pour un ajout au panier côté serveur,
 * l'identifiant du panier. Pas d'adresse IP : derrière le proxy d'App Hosting elle n'est
 * pas fiable, et on n'a ainsi aucune donnée personnelle à traiter.
 */
export function visitorHash(salt: string, day: string, id: string): string {
  return createHash("sha256").update(`${salt}|${day}|${id}`).digest("base64url").slice(0, 16);
}

export type DeviceKind = "mobile" | "tablette" | "ordinateur";

/** Famille d'appareil d'après le navigateur : assez pour un partage mobile / tablette / ordinateur. */
export function deviceKind(userAgent: string | null | undefined): DeviceKind {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(?:Android(?!.*Mobile))/i.test(ua)) return "tablette";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|webOS|BlackBerry|Opera Mini/i.test(ua)) return "mobile";
  return "ordinateur";
}

/** Clé de source : un `utm_source` explicite prime sur le site référent. */
export function sourceKey(utmSource: string | undefined | null, referrer: string | undefined | null, siteHost: string): string {
  const utm = (utmSource ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
  if (utm) return `utm:${utm}`;
  return referrerHost(referrer, siteHost);
}

export type SourceMeta = { name: string; ini: string; tone: "pink" | "blue" | "dark" | "sand" | "green" | "paper" };

/** Libellé, initiales et teinte d'une source, pour les listes (maquette « Sources de trafic »). */
export function sourceMeta(key: string): SourceMeta {
  if (key === DIRECT) return { name: "Accès direct", ini: "→", tone: "paper" };
  if (key.startsWith("utm:")) {
    const v = key.slice(4);
    if (v === "newsletter" || v === "email") return { name: "Newsletter", ini: "@", tone: "green" };
    if (v.startsWith("influ")) return { name: "Liens influenceurs", ini: "★", tone: "sand" };
    return { name: v.charAt(0).toUpperCase() + v.slice(1), ini: v.slice(0, 2).toUpperCase(), tone: "sand" };
  }
  const h = key.toLowerCase();
  if (/(^|\.)instagram\.com$/.test(h)) return { name: "Instagram", ini: "IG", tone: "pink" };
  if (/(^|\.)google\./.test(h)) return { name: "Google", ini: "G", tone: "blue" };
  if (/(^|\.)tiktok\.com$/.test(h)) return { name: "TikTok", ini: "TT", tone: "dark" };
  if (/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/.test(h)) return { name: "Facebook", ini: "FB", tone: "blue" };
  if (/(^|\.)pinterest\./.test(h)) return { name: "Pinterest", ini: "P", tone: "pink" };
  if (/(^|\.)(bing\.com|duckduckgo\.com|qwant\.com|ecosia\.org|yahoo\.)/.test(h)) return { name: h.split(".")[0].replace(/^\w/, (c) => c.toUpperCase()), ini: h.slice(0, 1).toUpperCase(), tone: "blue" };
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return { name: "YouTube", ini: "YT", tone: "pink" };
  if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(h)) return { name: "X (Twitter)", ini: "X", tone: "dark" };
  if (/(^|\.)linkedin\.com$/.test(h)) return { name: "LinkedIn", ini: "in", tone: "blue" };
  return { name: key, ini: key.replace(/^www\./, "").slice(0, 2).toUpperCase(), tone: "sand" };
}
