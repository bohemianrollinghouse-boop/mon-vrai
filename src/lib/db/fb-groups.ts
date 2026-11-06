import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  EMPTY_FB_CONFIG,
  FbClick,
  FbGroup,
  FbGroupsConfig,
  applyMembershipScan,
  applyPatch,
  applyScan,
  applyStaffContact,
  applyStaffReply,
  conversationScanFrom,
  groupRoot,
  groupSlug,
  isDuplicate,
  membershipScanFrom,
  mergeStaff,
  sameName,
  scanFrom,
  statsByGroup,
  type ApiStaffContact,
  type FbGroupPatch,
  type FbGroupStats,
  type FbMembership,
  type StaffEntry,
} from "@/lib/domain/fb-groups";
import { col, now, parseDoc } from "./helpers";

/*
 * Campagnes Facebook en base : un document par groupe (`fbGroups/<slug>` — le slug est
 * dans les liens déjà postés, il est donc aussi l'identifiant et ne change jamais), un
 * par clic (`fbClicks`), et le réglage de l'écran (`integrations/facebookGroups` : la
 * clé de l'API et la page d'arrivée). Logique pure dans `domain/fb-groups.ts`.
 */

const groups = () => col("fbGroups");
const clicks = () => col("fbClicks");
const configRef = () => col("integrations").doc("facebookGroups");

/* ---------- Réglage et clé ---------- */

export async function getFbConfig(): Promise<FbGroupsConfig> {
  return (await parseDoc(FbGroupsConfig, await configRef().get())) ?? EMPTY_FB_CONFIG;
}

async function setFbConfig(patch: Partial<FbGroupsConfig>): Promise<FbGroupsConfig> {
  const next = FbGroupsConfig.parse({ ...(await getFbConfig()), ...patch, updatedAt: now() });
  await configRef().set(next);
  return next;
}

/** Une nouvelle clé : l'ancienne cesse aussitôt de valoir. */
export async function rotateApiKey(): Promise<string> {
  const key = `mv_fb_${randomBytes(24).toString("base64url")}`;
  await setFbConfig({ apiKey: key, keyCreatedAt: now() });
  return key;
}

export async function revokeApiKey(): Promise<void> {
  await setFbConfig({ apiKey: null, keyCreatedAt: null });
}

export async function setLandingPath(landingPath: string): Promise<void> {
  await setFbConfig({ landingPath });
}

/**
 * La clé présentée est-elle la bonne ? Comparaison à temps constant, sur des
 * condensats de même longueur : la durée de la réponse ne dit rien de la clé.
 */
export async function apiKeyValid(presented: string | null | undefined): Promise<boolean> {
  const given = String(presented ?? "").trim();
  if (!given) return false;
  const { apiKey } = await getFbConfig();
  if (!apiKey) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(apiKey).digest();
  return timingSafeEqual(a, b);
}

/* ---------- Groupes ---------- */

export async function listFbGroups(): Promise<FbGroup[]> {
  const snap = await groups().get();
  return snap.docs.map((d) => parseDoc(FbGroup, d)).filter((g): g is FbGroup => g !== null);
}

export async function getFbGroup(slug: string): Promise<FbGroup | null> {
  if (!slug || slug.includes("/")) return null;
  return parseDoc(FbGroup, await groups().doc(slug).get());
}

/** Un groupe d'après son slug ou n'importe quel lien de ses pages. */
export async function findFbGroup(ref: string): Promise<FbGroup | null> {
  const bySlug = await getFbGroup(ref);
  if (bySlug) return bySlug;
  const root = groupRoot(ref);
  if (!root) return null;
  const snap = await groups().where("groupUrl", "==", root).limit(1).get();
  return snap.empty ? null : parseDoc(FbGroup, snap.docs[0]);
}

/** Déjà suivi ? À la même adresse, ou sous le même nom (un groupe a souvent deux adresses : alias et numéro). */
export async function checkFbGroup(url: string, name: string): Promise<{ groupUrl: string | null; exists: FbGroup | null; sameName: FbGroup[] }> {
  const root = groupRoot(url);
  const all = await listFbGroups();
  const exists = root ? (all.find((g) => g.groupUrl === root) ?? null) : null;
  const twins = name.trim() ? all.filter((g) => g !== exists && sameName(g.name, name)) : [];
  return { groupUrl: root, exists, sameName: twins };
}

export type NewFbGroup = {
  url: string;
  name: string;
  membership?: FbMembership;
  members?: number | null;
  message?: string | null;
  note?: string;
  /** Déjà validée (`checkStaff`). */
  staff?: StaffEntry[];
  addedBy: "agent" | "admin";
};

/**
 * Ajoute un groupe. Un groupe déjà suivi (même adresse) n'est pas dupliqué ni modifié :
 * il revient avec `existed`. Le slug est réservé par `create()`, qui échoue s'il est
 * pris — d'où le suffixe `-2`, `-3` — et non par un « existe-t-il ? » suivi d'une
 * écriture, que deux ajouts simultanés passeraient tous les deux.
 */
export async function addFbGroup(input: NewFbGroup): Promise<{ group: FbGroup; existed: boolean }> {
  const root = groupRoot(input.url);
  if (!root) throw new Error("ce n'est pas un lien de groupe Facebook (https://www.facebook.com/groups/…)");
  const name = input.name.trim().slice(0, 150);
  if (!name) throw new Error("name obligatoire : le nom du groupe tel qu'affiché sur Facebook");

  const already = await groups().where("groupUrl", "==", root).limit(1).get();
  if (!already.empty) {
    const g = parseDoc(FbGroup, already.docs[0]);
    if (g) return { group: g, existed: true };
  }

  const at = now();
  const base = groupSlug(name, root);
  for (let i = 1; i <= 20; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const group = FbGroup.parse({
      slug,
      name,
      groupUrl: root,
      membership: input.membership ?? "pending",
      members: input.members ?? null,
      message: input.message ?? null,
      messageAt: input.message ? at : null,
      note: (input.note ?? "").trim().slice(0, 500),
      staff: mergeStaff([], input.staff ?? [], at),
      staffAt: input.staff?.length ? at : null,
      addedBy: input.addedBy,
      createdAt: at,
      updatedAt: at,
    });
    try {
      await groups().doc(slug).create(group);
      return { group, existed: false };
    } catch (err) {
      // 6 = ALREADY_EXISTS : le slug est pris, on essaie le suivant.
      if ((err as { code?: number }).code !== 6) throw err;
    }
  }
  throw new Error("impossible de trouver un identifiant libre pour ce groupe");
}

/** Modifie un groupe en transaction : deux modifications simultanées ne s'écrasent pas. */
export async function updateFbGroup(slug: string, patch: FbGroupPatch): Promise<FbGroup> {
  const ref = groups().doc(slug);
  return ref.firestore.runTransaction(async (tx) => {
    const current = parseDoc(FbGroup, await tx.get(ref));
    if (!current) throw new Error("groupe introuvable");
    const next = FbGroup.parse(applyPatch(current, patch, now()));
    tx.set(ref, next);
    return next;
  });
}

/** Enregistre le relevé que le script Tampermonkey a rendu à la page. */
export async function recordFbScan(slug: string, raw: unknown): Promise<FbGroup> {
  const ref = groups().doc(slug);
  return ref.firestore.runTransaction(async (tx) => {
    const current = parseDoc(FbGroup, await tx.get(ref));
    if (!current) throw new Error("groupe introuvable");
    const next = FbGroup.parse(applyScan(current, scanFrom(raw, now())));
    tx.set(ref, next);
    return next;
  });
}

/**
 * Enregistre le relevé de la page du groupe (notre adhésion). Rend aussi l'adhésion d'avant :
 * l'écran en fait le bilan de la vérification.
 */
export async function recordFbMembershipScan(slug: string, raw: unknown): Promise<{ group: FbGroup; before: FbMembership }> {
  const ref = groups().doc(slug);
  return ref.firestore.runTransaction(async (tx) => {
    const current = parseDoc(FbGroup, await tx.get(ref));
    if (!current) throw new Error("groupe introuvable");
    const next = FbGroup.parse(applyMembershipScan(current, membershipScanFrom(raw, now())));
    tx.set(ref, next);
    return { group: next, before: current.membership };
  });
}

/** Note un message envoyé à un admin ou un modérateur du groupe (`applyStaffContact`). */
export async function recordFbStaffContact(slug: string, input: ApiStaffContact): Promise<FbGroup> {
  const ref = groups().doc(slug);
  return ref.firestore.runTransaction(async (tx) => {
    const current = parseDoc(FbGroup, await tx.get(ref));
    if (!current) throw new Error("groupe introuvable");
    const at = now();
    const next = FbGroup.parse({ ...current, staff: applyStaffContact(current.staff, input, at), updatedAt: at });
    tx.set(ref, next);
    return next;
  });
}

/** Enregistre le relevé de la conversation avec une personne du groupe (clé : `staffKey`). */
export async function recordFbStaffReply(slug: string, key: string, raw: unknown): Promise<FbGroup> {
  const ref = groups().doc(slug);
  return ref.firestore.runTransaction(async (tx) => {
    const current = parseDoc(FbGroup, await tx.get(ref));
    if (!current) throw new Error("groupe introuvable");
    const at = now();
    const next = FbGroup.parse({ ...current, staff: applyStaffReply(current.staff, key, conversationScanFrom(raw, at), (raw as { conversationUrl?: unknown } | null)?.conversationUrl), updatedAt: at });
    tx.set(ref, next);
    return next;
  });
}

/** « Vu » : les commentaires relevés passent dans le total déjà lu. */
export async function markFbCommentsSeen(slug: string): Promise<void> {
  const ref = groups().doc(slug);
  await ref.firestore.runTransaction(async (tx) => {
    const current = parseDoc(FbGroup, await tx.get(ref));
    if (!current) throw new Error("groupe introuvable");
    tx.set(ref, { ...current, commentsSeen: current.scan?.comments ?? 0, updatedAt: now() });
  });
}

/** Supprime un groupe. Ses clics restent en base (ils ne coûtent rien et disent ce qui a été mesuré). */
export async function deleteFbGroup(slug: string): Promise<void> {
  await groups().doc(slug).delete();
}

/* ---------- Clics ---------- */

export type ClickInput = Omit<FbClick, "kind" | "at"> & { robot: boolean };

/**
 * Enregistre un clic. Robots et doublons sont gardés, marqués, plutôt que jetés. Un
 * slug inconnu n'est pas enregistré : l'adresse de la balise est publique, et
 * n'importe qui pourrait sinon remplir la collection de groupes inventés.
 */
export async function recordFbClick(input: ClickInput): Promise<void> {
  const exists = await groups().doc(input.group).get();
  if (!exists.exists) return;
  const at = now();
  const { robot, ...rest } = input;
  let kind: FbClick["kind"] = robot ? "bot" : "human";
  if (kind === "human" && rest.visitor) {
    // L'empreinte comprend le jour et le groupe : quelques documents au plus.
    const prev = await clicks().where("visitor", "==", rest.visitor).limit(20).get();
    if (isDuplicate(prev.docs.map((d) => Number(d.get("at")) || 0), at)) kind = "duplicate";
  }
  await clicks().add(FbClick.parse({ ...rest, kind, at }));
}

/** Les clics humains par groupe (liste de l'écran). Seuls trois champs sont relus. */
export async function fbStatsByGroup(): Promise<Record<string, FbGroupStats>> {
  const snap = await clicks().select("group", "kind", "at").get();
  const rows = snap.docs.map((d) => ({ group: String(d.get("group") ?? ""), kind: d.get("kind") as FbClick["kind"], at: Number(d.get("at")) || 0 }));
  return statsByGroup(rows, now());
}

/** Tous les clics d'un groupe, pour son détail. Plafonnés : au-delà, seuls les totaux historiques seraient tronqués. */
export async function listFbClicks(slug: string, limit = 5000): Promise<FbClick[]> {
  const snap = await clicks().where("group", "==", slug).limit(limit).get();
  return snap.docs.map((d) => parseDoc(FbClick, d)).filter((c): c is FbClick => c !== null);
}
