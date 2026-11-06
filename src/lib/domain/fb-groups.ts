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

/**
 * Notre adhésion : pas demandée, en attente d'un admin du groupe, acceptée, refusée. « Refusée »
 * veut dire que le bouton « Rejoindre le groupe » est revenu : demande refusée, ou retirés du
 * groupe. Elle ne vient que d'un relevé de la page du groupe ou d'un choix dans l'écran : un
 * groupe ne s'ajoute jamais refusé (`FB_NEW_MEMBERSHIPS`).
 */
export const FB_MEMBERSHIPS = ["none", "pending", "validated", "refused"] as const;
export type FbMembership = (typeof FB_MEMBERSHIPS)[number];
export const FB_NEW_MEMBERSHIPS = ["none", "pending", "validated"] as const;

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

/*
 * Le relevé de la page du groupe (script 1.6.0 et plus, `kind: 'group'`) : ce que disent
 * les boutons de son en-tête. « Membre » ou « Inviter » : membre ; « Annuler la demande » :
 * en attente ; « Rejoindre le groupe » : pas membre ; page introuvable ; ou rien de
 * reconnaissable. Gardé à part de l'adhésion, qu'il ne fait que proposer (`membershipFromScan`).
 */
export const FB_MEMBERSHIP_SCAN_STATES = ["member", "pending", "join", "unavailable", "unknown"] as const;
export type FbMembershipScanState = (typeof FB_MEMBERSHIP_SCAN_STATES)[number];
export const FbMembershipScan = z.object({
  state: z.enum(FB_MEMBERSHIP_SCAN_STATES),
  at: z.number(),
  note: z.string().nullable().default(null),
});
export type FbMembershipScan = z.infer<typeof FbMembershipScan>;

/*
 * Le relevé d'une conversation Messenger (script 1.7.0 et plus, `kind: 'staff'`), lue comme
 * une conversation Marketplace de COBA : a-t-on une réponse de l'admin à qui l'on a écrit ?
 */
export const FB_CONV_SCAN_STATES = ["ok", "unavailable", "unknown"] as const;
export type FbConvScanState = (typeof FB_CONV_SCAN_STATES)[number];
export const FbConversationScan = z.object({
  state: z.enum(FB_CONV_SCAN_STATES),
  /** Messages de l'autre restés sans réponse (ceux écrits après notre dernier) ; null = illisible. */
  theirs: z.number().int().nonnegative().nullable().default(null),
  /** Nos messages visibles. */
  mine: z.number().int().nonnegative().nullable().default(null),
  /** Qui a écrit le dernier. */
  lastFrom: z.enum(["me", "them"]).nullable().default(null),
  /** Début du dernier message, pour l'aperçu. */
  lastText: z.string().nullable().default(null),
  /** Empreinte du dernier message de l'autre ; null = il n'a rien écrit de visible. */
  lastKey: z.string().nullable().default(null),
  at: z.number(),
  note: z.string().nullable().default(null),
});
export type FbConversationScan = z.infer<typeof FbConversationScan>;

/* ---------- Admins et modérateurs ---------- */

/*
 * Ceux qui tiennent le groupe : ce sont eux qui valident une adhésion, laissent passer
 * un post ou le retirent. Les connaître, c'est savoir à qui l'on a affaire quand un post
 * reste en attente — et à qui écrire, à la main, si l'on veut demander la permission.
 * Relevés par l'agent sur l'onglet « Membres » du groupe, jamais devinés.
 *
 * Le lien de profil est ramené à une forme stable (`profileUrlFrom`) : Facebook y colle
 * des paramètres de suivi (`__cft__`, `__tn__`) qui changent à chaque affichage, et la
 * même personne paraîtrait sinon deux fois dans la liste.
 */
export const FB_STAFF_ROLES = ["admin", "moderator"] as const;
export type FbStaffRole = (typeof FB_STAFF_ROLES)[number];
export const FB_STAFF_MAX = 30;
export const STAFF_LABELS: Record<FbStaffRole, string> = { admin: "Admin", moderator: "Modérateur" };

/*
 * Le suivi d'un contact (une conversation Messenger ouverte avec la personne) est fait de
 * clés ABSENTES tant qu'on ne lui a pas écrit, jamais de `null` ni de chaîne vide : les
 * documents écrits avant ce suivi restent valides tels quels.
 */
export const FbStaff = z.object({
  name: z.string().min(1),
  role: z.enum(FB_STAFF_ROLES).default("admin"),
  /** Lien du profil (ou de la Page, quand c'est une Page qui administre). Null si l'agent ne l'a pas vu. */
  profileUrl: z.string().nullable().default(null),
  /** La conversation Messenger avec elle (`conversationUrlFrom`). */
  conversationUrl: z.string().optional(),
  /** Quand on lui a écrit : posé par le serveur quand la conversation apparaît ou change. */
  contactedAt: z.number().optional(),
  /** Le message qu'on lui a envoyé, tel quel. */
  contactMessage: z.string().optional(),
  /** Dernier relevé de la conversation. Oublié quand la conversation change. */
  reply: FbConversationScan.optional(),
});
export type FbStaff = z.infer<typeof FbStaff>;

export const FbGroup = z.object({
  /** Valeur de `?fb=` et identifiant du document : c'est lui qui rattache les clics au groupe. Ne change jamais. */
  slug: z.string().min(1),
  name: z.string().min(1),
  /** Racine canonique `https://www.facebook.com/groups/<id ou alias>`. */
  groupUrl: z.string().min(1),
  status: z.enum(FB_TABS).default("new"),
  membership: z.enum(FB_MEMBERSHIPS).default("pending"),
  /** Quand l'adhésion a changé pour la dernière fois (relevé ou choix dans l'écran). */
  membershipChangedAt: z.number().nullable().default(null),
  /** Dernier relevé de la page du groupe par le script Tampermonkey. */
  membershipScan: FbMembershipScan.nullable().default(null),
  /** Ce que le script a vu dans l'en-tête du groupe, comme `scanDiag`. */
  membershipDiag: z.string().nullable().default(null),
  /** Nombre de membres relevé par l'agent, s'il l'a vu. */
  members: z.number().int().nonnegative().nullable().default(null),
  /** Le message à poster, avec `{lien}`. Null tant que personne ne l'a rédigé. */
  message: z.string().nullable().default(null),
  messageAt: z.number().nullable().default(null),
  postUrl: z.string().nullable().default(null),
  postStatus: z.enum(FB_POST_STATES).nullable().default(null),
  /** Ce qu'il faut savoir du groupe en une phrase (« pub le samedi seulement »). */
  note: z.string().default(""),
  /** Admins et modérateurs, dans l'ordre où Facebook les affiche. */
  staff: z.array(FbStaff).default([]),
  /** Quand la liste a été relevée pour la dernière fois. */
  staffAt: z.number().nullable().default(null),
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

/**
 * La page « Administrateurs et modérateurs » du groupe — celle où l'agent relève
 * `staff`, et celle où aller soi-même quand la liste est vide ou qu'on veut écrire à
 * quelqu'un qui n'y figure pas encore. Beaucoup de groupes n'acceptent une publication
 * qu'avec l'accord d'un admin : sans ce lien, il faut rouvrir le groupe et chercher.
 *
 * Déduite du groupe, jamais stockée : une adresse recopiée sur chaque groupe serait
 * autant d'occasions de se tromper, et le jour où Facebook la change il y a UN endroit
 * à corriger. Null si l'adresse du groupe n'en est pas une.
 */
export function staffUrl(groupUrl: string): string | null {
  const root = groupRoot(groupUrl);
  return root && `${root}/members/admins`;
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

/* Chemins de facebook.com qui ne sont pas un profil, même s'ils n'ont qu'un segment. */
const NOT_PROFILES = new Set([
  "groups", "events", "watch", "marketplace", "gaming", "login", "login.php", "share", "sharer", "sharer.php",
  "story.php", "permalink.php", "photo", "photo.php", "photos", "videos", "reel", "reels", "hashtag", "search",
  "help", "settings", "notifications", "messages", "friends", "bookmarks", "pages", "home.php", "policies", "privacy",
]);

/**
 * Un lien de profil Facebook (personne ou Page) ramené à sa forme stable, ou null s'il
 * n'en est pas un. Formes admises : `/profile.php?id=…`, `/<nom d'utilisateur>`,
 * `/people/<nom>/<id>`, et `/groups/<groupe>/user/<id>` — celle que donne la liste des
 * membres d'un groupe. Paramètres de suivi, sous-domaine (`m.`, `web.`) et barre finale
 * sont retirés.
 */
export function profileUrlFrom(raw: string | null | undefined): string | null {
  let u: URL;
  try {
    u = new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
  const base = "https://www.facebook.com";
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "profile.php") {
    const id = u.searchParams.get("id") ?? "";
    return /^\d{1,25}$/.test(id) ? `${base}/profile.php?id=${id}` : null;
  }
  if (parts[0] === "groups" && parts[2] === "user" && parts[1] && /^\d{1,25}$/.test(parts[3] ?? "")) {
    return `${base}/groups/${parts[1]}/user/${parts[3]}`;
  }
  if (parts[0] === "people" && parts.length >= 3 && /^\d{1,25}$/.test(parts[2])) return `${base}/people/${parts[1]}/${parts[2]}`;
  if (parts.length === 1 && /^[A-Za-z0-9.\-]{2,80}$/.test(parts[0]) && !NOT_PROFILES.has(parts[0].toLowerCase())) return `${base}/${parts[0]}`;
  return null;
}

/**
 * Un lien de conversation Messenger ramené à la forme que le script sait ouvrir
 * (`https://www.facebook.com/messages/t/<id>` ou `/messages/e2ee/t/<id>`), ou null si vide.
 * Les mêmes adresses sur messenger.com sont acceptées et converties. Lève sur toute autre
 * adresse : un lien refusé en silence serait une conversation perdue.
 */
export function conversationUrlFrom(raw: unknown): string | null {
  const given = String(raw ?? "").trim();
  if (!given) return null;
  const refused = new Error(`lien de conversation Messenger attendu (https://www.facebook.com/messages/t/…), reçu « ${given.slice(0, 120)} »`);
  let u: URL;
  try {
    u = new URL(given);
  } catch {
    throw refused;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw refused;
  const p = u.pathname.split("/").filter(Boolean);
  let path: string[] | null = null;
  if (/(^|\.)facebook\.com$/i.test(u.hostname) && p[0] === "messages") path = p.slice(1);
  else if (/(^|\.)messenger\.com$/i.test(u.hostname)) path = p;
  if (path?.[0] === "t" && /^[\w.-]{1,80}$/.test(path[1] ?? "")) return `https://www.facebook.com/messages/t/${path[1]}`;
  if (path?.[0] === "e2ee" && path[1] === "t" && /^\d{1,30}$/.test(path[2] ?? "")) return `https://www.facebook.com/messages/e2ee/t/${path[2]}`;
  throw refused;
}

/** L'identifiant d'une personne dans la liste : son profil, sinon son nom. */
export function staffKey(p: Pick<FbStaff, "name" | "profileUrl">): string {
  return p.profileUrl ?? `nom:${slugify(p.name)}`;
}

export const FB_CONTACT_MESSAGE_MAX = 4000;

/**
 * Ce qu'on reçoit d'une personne (API ou écran). Les champs de lecture seule que rend l'API
 * (`contactedAt`, `replied`, `reply`) sont admis pour être IGNORÉS : un agent renvoie souvent
 * la liste telle qu'il l'a lue, et la refuser pour ça ne servirait à rien.
 */
export type StaffInput = {
  name: string;
  role: FbStaffRole;
  profileUrl?: string | null;
  conversationUrl?: string | null;
  contactMessage?: string | null;
};

/**
 * Une personne validée, prête à être fusionnée avec ce qu'on savait d'elle
 * (`mergeStaff`). Pour `conversationUrl` et `contactMessage` : absent = inchangé,
 * null = effacé.
 */
export type StaffEntry = {
  name: string;
  role: FbStaffRole;
  profileUrl: string | null;
  conversationUrl?: string | null;
  contactMessage?: string | null;
};

/**
 * Valide une liste d'admins et de modérateurs. Lève, en nommant la ligne et la personne, sur
 * un nom vide ou un lien qui n'est pas ce qu'il prétend être : un lien refusé en silence
 * serait un lien perdu. Une même personne (même profil, ou même nom sans profil) n'est
 * gardée qu'une fois.
 */
export function checkStaff(list: StaffInput[]): StaffEntry[] {
  if (list.length > FB_STAFF_MAX) throw new Error(`staff : ${FB_STAFF_MAX} personnes au plus`);
  const out: StaffEntry[] = [];
  const seen = new Set<string>();
  list.forEach((p, i) => {
    const name = String(p.name ?? "").trim().slice(0, 100);
    if (!name) throw new Error(`staff[${i}].name : nom obligatoire`);
    const given = String(p.profileUrl ?? "").trim();
    const profileUrl = given ? profileUrlFrom(given) : null;
    if (given && !profileUrl) throw new Error(`staff[${i}].profileUrl : lien de profil Facebook attendu pour ${name} (https://www.facebook.com/…), reçu « ${given.slice(0, 120)} »`);
    const entry: StaffEntry = { name, role: p.role, profileUrl };
    if (p.conversationUrl !== undefined) {
      try {
        entry.conversationUrl = conversationUrlFrom(p.conversationUrl);
      } catch (err) {
        throw new Error(`staff[${i}].conversationUrl : ${name} : ${(err as Error).message}`);
      }
    }
    if (p.contactMessage !== undefined) entry.contactMessage = String(p.contactMessage ?? "").trim().slice(0, FB_CONTACT_MESSAGE_MAX) || null;
    const key = staffKey(entry);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  });
  return out;
}

/**
 * La liste à écrire : la nouvelle (ordre, noms, rôles, profils), avec ce que l'ancienne
 * savait de chaque personne (conversation, date du contact, message, relevé de la réponse)
 * quand la nouvelle ne le redonne pas. Une conversation qui apparaît ou change date le
 * contact de `at` et oublie l'ancien relevé ; la même conversation renvoyée ne bouge rien.
 * Aucune clé `undefined` ni vide en sortie : Firestore n'en veut pas.
 */
export function mergeStaff(previous: FbStaff[], next: StaffEntry[], at: number): FbStaff[] {
  const before = new Map(previous.map((p) => [staffKey(p), p]));
  return next.map((n) => {
    const a = before.get(staffKey(n));
    const out: FbStaff = { name: n.name, role: n.role, profileUrl: n.profileUrl };
    const conversation = n.conversationUrl !== undefined ? n.conversationUrl : a?.conversationUrl;
    const message = n.contactMessage !== undefined ? n.contactMessage : a?.contactMessage;
    if (conversation) {
      const same = a?.conversationUrl === conversation;
      out.conversationUrl = conversation;
      out.contactedAt = same && a?.contactedAt ? a.contactedAt : at;
    }
    if (message) out.contactMessage = message;
    if (conversation && a?.conversationUrl === conversation && a.reply) out.reply = a.reply;
    return out;
  });
}

/** Les noms, rôles et profils seulement : c'est leur changement que date `staffAt`, pas un contact. */
function staffPeople(staff: FbStaff[]): string {
  return JSON.stringify(staff.map((p) => [p.name, p.role, p.profileUrl]));
}

/** Une valeur sérialisée clés triées : l'ordre des champs d'un document relu ne dit rien. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Qu'on a écrit à quelqu'un du groupe : ce que reçoit `POST /{group}/staff/contact`. */
export const ApiStaffContact = z
  .object({
    profileUrl: z.string().nullable().optional(),
    name: z.string().max(100).nullable().optional(),
    role: z.enum(FB_STAFF_ROLES, { message: "role : admin ou moderator" }).optional(),
    conversationUrl: z.string({ message: "conversationUrl obligatoire : le lien de la conversation Messenger" }),
    message: z.string().max(FB_CONTACT_MESSAGE_MAX).nullable().optional(),
  })
  .strict();
export type ApiStaffContact = z.infer<typeof ApiStaffContact>;

/**
 * Note un message envoyé à quelqu'un du groupe : sa conversation, le message, la date. La
 * personne est retrouvée par son profil, sinon par son nom ; absente de la liste, elle y
 * est ajoutée, et son rôle est alors exigé. Rend la nouvelle liste. Lève avec un message
 * lisible par l'agent.
 */
export function applyStaffContact(staff: FbStaff[], input: ApiStaffContact, at: number): FbStaff[] {
  const conversationUrl = conversationUrlFrom(input.conversationUrl);
  if (!conversationUrl) throw new Error("conversationUrl obligatoire : le lien de la conversation Messenger");
  const given = String(input.profileUrl ?? "").trim();
  const profileUrl = given ? profileUrlFrom(given) : null;
  if (given && !profileUrl) throw new Error(`profileUrl : lien de profil Facebook attendu, reçu « ${given.slice(0, 120)} »`);
  const name = String(input.name ?? "").trim().slice(0, 100);
  if (!profileUrl && !name) throw new Error("profileUrl ou name obligatoire : à qui as-tu écrit ?");

  let i = profileUrl ? staff.findIndex((p) => p.profileUrl === profileUrl) : -1;
  if (i === -1 && name) i = staff.findIndex((p) => sameName(p.name, name) && (!p.profileUrl || !profileUrl));
  if (i === -1) {
    if (!input.role) throw new Error(`role obligatoire : ${name || profileUrl} n'est pas dans la liste des admins et modérateurs, et sera ajouté (admin ou moderator, lu sur la page du groupe)`);
    if (!name) throw new Error("name obligatoire pour ajouter quelqu'un à la liste");
    if (staff.length >= FB_STAFF_MAX) throw new Error(`staff : ${FB_STAFF_MAX} personnes au plus`);
  }
  const person = i === -1 ? { name, role: input.role!, profileUrl } : { name: staff[i].name, role: staff[i].role, profileUrl: staff[i].profileUrl ?? profileUrl };
  const entry: StaffEntry = { ...person, conversationUrl };
  if (input.message !== undefined) entry.contactMessage = String(input.message ?? "").trim().slice(0, FB_CONTACT_MESSAGE_MAX) || null;
  // La personne garde sa place et ce qu'on savait d'elle ; sa clé peut changer (profil appris).
  const previous = i === -1 ? staff : staff.map((p, j) => (j === i ? { ...p, profileUrl: person.profileUrl } : p));
  const [merged] = mergeStaff(previous, [entry], at);
  return i === -1 ? [...staff, merged] : staff.map((p, j) => (j === i ? merged : p));
}

/** Valide le relevé d'une conversation rendu par le script (donc venu du navigateur). */
export function conversationScanFrom(raw: unknown, at: number): FbConversationScan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const count = (v: unknown): number | null => {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 ? null : Math.floor(n);
  };
  const text = (v: unknown, max: number): string | null => String(v ?? "").trim().slice(0, max) || null;
  return {
    state: (FB_CONV_SCAN_STATES as readonly string[]).includes(String(r.state)) ? (r.state as FbConvScanState) : "unknown",
    theirs: count(r.theirs),
    mine: count(r.mine),
    lastFrom: r.lastFrom === "them" || r.lastFrom === "me" ? r.lastFrom : null,
    lastText: text(r.lastText, 200),
    lastKey: text(r.lastKey, 200),
    at,
    note: text(r.note, 500),
  };
}

/** Enregistre le relevé de la conversation d'une personne. Lève si elle n'est plus dans la liste. */
export function applyStaffReply(staff: FbStaff[], key: string, scan: FbConversationScan): FbStaff[] {
  const i = staff.findIndex((p) => staffKey(p) === key);
  if (i === -1) throw new Error("personne introuvable dans la liste des admins (modifiée entre-temps ?)");
  if (!staff[i].conversationUrl) throw new Error(`aucune conversation notée avec ${staff[i].name}`);
  return staff.map((p, j) => (j === i ? { ...p, reply: scan } : p));
}

/** A-t-elle répondu ? Ce que l'API en dit : null tant que la conversation n'a pas été relue. */
export function staffReplied(p: Pick<FbStaff, "reply">): boolean | null {
  return p.reply && p.reply.state === "ok" ? !!p.reply.lastKey : null;
}

export type StaffReplyKey = "replied" | "ongoing" | "silent" | "missing" | "unreadable";

/** La pastille de la réponse : a répondu, échange en cours, pas de réponse, introuvable, illisible. Null si jamais relue. */
export function staffReplyState(p: Pick<FbStaff, "reply">): StaffReplyKey | null {
  const r = p.reply;
  if (!r) return null;
  if (r.state === "unavailable") return "missing";
  if (r.state !== "ok") return "unreadable";
  if (r.lastFrom === "them") return "replied";
  return r.lastKey ? "ongoing" : "silent";
}

export const STAFF_REPLY_LABELS: Record<StaffReplyKey, string> = {
  replied: "A répondu",
  ongoing: "Échange en cours",
  silent: "Pas de réponse",
  missing: "Conversation introuvable",
  unreadable: "Illisible",
};

/*
 * Où en est le contact des admins d'un groupe, pour le filtre de l'écran et le champ
 * `contactState` de l'API (le même calcul des deux côtés, et le même que COBA) :
 * « replied » dès qu'une personne a répondu, c'est-à-dire qu'un message d'elle a été relevé
 * (`staffReplied`), même si l'on a réécrit depuis ; « sent » si au moins une a reçu un
 * message (conversation notée) ; « none » sinon, liste vide comprise. Un relevé illisible ou
 * une conversation introuvable ne disent pas qu'elle a répondu : le groupe reste « sent ».
 */
export const FB_CONTACT_STATES = ["none", "sent", "replied"] as const;
export type FbContactState = (typeof FB_CONTACT_STATES)[number];
export const CONTACT_LABELS: Record<FbContactState, string> = {
  none: "Pas encore contacté",
  sent: "Message envoyé, sans réponse",
  replied: "Réponse reçue",
};

export function staffContactState(staff: Pick<FbStaff, "conversationUrl" | "reply">[]): FbContactState {
  if (staff.some((p) => staffReplied(p) === true)) return "replied";
  return staff.some((p) => !!p.conversationUrl) ? "sent" : "none";
}

/** Le filtre « admins renseignés » : with = liste non vide, without = vide. */
export const FB_STAFF_FILTERS = ["with", "without"] as const;
export type FbStaffFilter = (typeof FB_STAFF_FILTERS)[number];
export const STAFF_FILTER_LABELS: Record<FbStaffFilter, string> = { with: "Avec admins renseignés", without: "Sans admins renseignés" };

/**
 * Les deux filtres sur les admins, cumulables. L'état du contact implique des admins
 * renseignés : un groupe sans personne relevée n'en sort jamais, même pour « none ».
 */
export function matchesStaffFilters(g: Pick<FbGroup, "staff">, f: { staff?: FbStaffFilter | null; contact?: FbContactState | null }): boolean {
  const has = g.staff.length > 0;
  if (f.staff && (f.staff === "with") !== has) return false;
  return !f.contact || (has && staffContactState(g.staff) === f.contact);
}

/* ---------- Changer l'état d'un groupe ---------- */

export type FbGroupPatch = Partial<Pick<FbGroup, "status" | "membership" | "postUrl" | "postStatus" | "note" | "members" | "name">> & {
  message?: string | null;
  /** La liste entière, fusionnée avec ce qu'on savait de chacun (`mergeStaff`). */
  staff?: StaffEntry[];
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
  if (patch.membership !== undefined && patch.membership !== current.membership) {
    next.membership = patch.membership;
    next.membershipChangedAt = at;
  }
  if (patch.members !== undefined) next.members = patch.members;
  if (patch.note !== undefined) next.note = patch.note.trim().slice(0, FB_NOTE_MAX);
  if (patch.staff !== undefined) {
    // Une liste inchangée ne se réécrit pas, et `staffAt` dit quand on a relevé les
    // personnes : noter un contact ne le change pas.
    const merged = mergeStaff(current.staff, patch.staff, at);
    if (stable(merged) !== stable(current.staff)) {
      next.staff = merged;
      if (staffPeople(merged) !== staffPeople(current.staff)) next.staffAt = at;
    }
  }
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

/** Valide un relevé de la page d'un groupe rendu par le script. */
export function membershipScanFrom(raw: unknown, at: number): { scan: FbMembershipScan; diag: string | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const state = (FB_MEMBERSHIP_SCAN_STATES as readonly string[]).includes(String(r.state)) ? (r.state as FbMembershipScanState) : "unknown";
  return {
    scan: { state, at, note: r.note ? String(r.note).slice(0, 500) : null },
    diag: r.diag ? String(r.diag).slice(0, 3000) : null,
  };
}

/**
 * L'adhésion que dit un relevé, ou null quand il ne dit rien de sûr et qu'on garde ce qu'on
 * sait. « Rejoindre le groupe » ne veut dire « refusée » que si l'on avait demandé : une
 * adhésion jamais demandée reste « pas demandée ». Page introuvable (groupe supprimé, ou
 * nous bannis : impossible de savoir lequel) et page illisible ne changent rien.
 */
export function membershipFromScan(state: FbMembershipScanState, current: FbMembership): FbMembership | null {
  if (state === "member") return "validated";
  if (state === "pending") return "pending";
  if (state === "join") return current === "none" ? null : "refused";
  return null;
}

/**
 * Applique un relevé de la page du groupe. Comme pour les posts, la page fait foi : elle
 * remplace l'adhésion saisie à la main. Un refus range le groupe dans « Refusés » ; une
 * adhésion qui revient l'en ressort vers « À faire », mais seulement s'il y était : un
 * groupe rangé ailleurs à la main y reste.
 */
export function applyMembershipScan(g: FbGroup, read: ReturnType<typeof membershipScanFrom>): FbGroup {
  const next: FbGroup = { ...g, membershipScan: read.scan, membershipDiag: read.diag, updatedAt: read.scan.at };
  const membership = membershipFromScan(read.scan.state, g.membership);
  if (!membership || membership === g.membership) return next;
  next.membership = membership;
  next.membershipChangedAt = read.scan.at;
  if (membership === "refused" && g.status !== "refused") next.status = "refused";
  if (g.membership === "refused" && g.status === "refused") next.status = "new";
  return next;
}

export const MEMBERSHIP_SCAN_LABELS: Record<FbMembershipScanState, string> = {
  member: "Membre",
  pending: "En attente",
  join: "« Rejoindre » affiché",
  unavailable: "Groupe introuvable",
  unknown: "Illisible",
};

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
export const MEMBERSHIP_LABELS: Record<FbMembership, string> = { none: "Pas demandée", pending: "En attente", validated: "Membre", refused: "Refusée" };
export const POST_LABELS: Record<FbPostState, string> = { pending: "Post en attente", validated: "Post validé", deleted: "Post supprimé" };

/* ---------- Où en est un groupe ---------- */

/*
 * Un groupe traverse toujours la même suite : demander l'adhésion, l'obtenir, écrire
 * un message, le poster, voir le post passer la modération, lire les commentaires.
 * `groupStage` dit en UN point où il en est, et c'est tout ce que porte sa ligne une
 * fois repliée — la liste se parcourt alors sans rien déplier.
 *
 * Rien n'est tenu à jour : tout se déduit de l'adhésion, du message, du post et du
 * relevé. C'est la règle du suivi des campagnes et des concours, et elle vaut ici pour
 * la même raison — un état qu'on ne maintient pas ne peut pas mentir. Poster son
 * message fait donc passer un groupe de « À poster » à « Post en attente » sans que
 * personne ait coché quoi que ce soit.
 *
 * Le SABLE (`warn`) est réservé aux étapes qui attendent quelque chose de NOUS —
 * demander, écrire, poster, reposter, lire. Une adhésion ou une modération en attente
 * ne dépend pas de nous et reste bleue, un post validé est vert. C'est la convention
 * du suivi des campagnes : la seule couleur qui appelle un geste aujourd'hui.
 */
export type FbStageKey = "refused" | "ignored" | "join" | "joining" | "write" | "post" | "moderation" | "deleted" | "read" | "done";

/* Les teintes de `Pill` (components/admin/ui.tsx), redites ici parce que le domaine
   n'importe rien d'un composant : c'est le typage de l'écran qui vérifie l'accord. */
type PillTone = "neutral" | "ok" | "warn" | "muted" | "blue" | "pink";

export type FbStage = {
  key: FbStageKey;
  /** Ce qui s'affiche sur la ligne repliée. Court : c'est un repère, pas une phrase. */
  label: string;
  tone: PillTone;
};

export function groupStage(g: Pick<FbGroup, "status" | "membership" | "message" | "postUrl" | "postStatus" | "scan" | "commentsSeen">): FbStage {
  const fresh = newComments(g);
  // Des commentaires non lus passent avant tout le reste : c'est quelqu'un qui parle.
  if (fresh > 0) return { key: "read", label: `${fresh} à lire`, tone: "warn" };
  if (g.status === "refused") return { key: "refused", label: "Refusé", tone: "pink" };
  if (g.status === "ignored") return { key: "ignored", label: "Ignoré", tone: "muted" };
  if (g.postUrl) {
    if (g.postStatus === "deleted") return { key: "deleted", label: "Post supprimé", tone: "warn" };
    if (g.postStatus === "validated") return { key: "done", label: "Posté", tone: "ok" };
    return { key: "moderation", label: "Post en attente", tone: "blue" };
  }
  if (g.membership === "refused") return { key: "refused", label: "Adhésion refusée", tone: "pink" };
  if (g.membership === "none") return { key: "join", label: "Adhésion à demander", tone: "warn" };
  if (g.membership === "pending") return { key: "joining", label: "Adhésion en attente", tone: "blue" };
  if (!g.message) return { key: "write", label: "Message à écrire", tone: "warn" };
  return { key: "post", label: "À poster", tone: "warn" };
}

/* ---------- Ce que l'API accepte ---------- */

export const LOT_MAX = 50;

/** Un admin ou un modérateur, tel que l'API le reçoit. Le rôle est exigé : le deviner rangerait un modérateur parmi les admins. */
export const ApiStaff = z
  .object({
    name: z.string().trim().min(1, "nom obligatoire").max(100),
    role: z.enum(FB_STAFF_ROLES, { message: "role : admin ou moderator" }),
    profileUrl: z.string().nullable().optional(),
    /** Absent = inchangé ; null ou vide = effacé. */
    conversationUrl: z.string().nullable().optional(),
    contactMessage: z.string().max(FB_CONTACT_MESSAGE_MAX).nullable().optional(),
    /* Lecture seule : admis tels que l'API les rend, et ignorés. */
    contactedAt: z.unknown().optional(),
    replied: z.unknown().optional(),
    reply: z.unknown().optional(),
  })
  .strict();

/** Un groupe à ajouter. Le nom est obligatoire : le serveur ne peut pas le lire sur Facebook. */
export const ApiNewGroup = z.object({
  url: z.string().min(1, "url obligatoire"),
  name: z.string().trim().min(1, "name obligatoire : le nom du groupe tel qu'affiché sur Facebook").max(150),
  membership: z.enum(FB_NEW_MEMBERSHIPS).optional(),
  members: z.number().int().nonnegative().nullable().optional(),
  message: z.string().nullable().optional(),
  note: z.string().max(FB_NOTE_MAX).optional(),
  staff: z.array(ApiStaff).max(FB_STAFF_MAX).optional(),
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
    /** Remplace la liste entière (vide = l'effacer). */
    staff: z.array(ApiStaff).max(FB_STAFF_MAX),
  })
  .partial()
  .strict();
export type ApiPatch = z.infer<typeof ApiPatch>;

/** Premier problème d'une validation zod, lisible par l'agent. */
export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return "requête invalide";
  if (i.code === "unrecognized_keys") {
    return i.path.length ? `${i.path.join(".")} : champ inconnu (${i.keys.join(", ")})` : `champ non modifiable par l'API : ${i.keys.join(", ")}`;
  }
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
  if (input.staff !== undefined) patch.staff = checkStaff(input.staff);
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
