"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { addFbGroup, deleteFbGroup, getFbGroup, markFbCommentsSeen, recordFbScan, revokeApiKey, rotateApiKey, setLandingPath, updateFbGroup } from "@/lib/db/fb-groups";
import { ApiPatch, FB_MEMBERSHIPS, FB_POST_STATES, FB_TABS, firstIssue, landingPathFrom, postUrlFrom, toPatch } from "@/lib/domain/fb-groups";
import { siteHost } from "@/lib/fb-groups/api";

/*
 * Les gestes de /admin/facebook. Une action par formulaire, et chacune relit le groupe
 * avant d'y toucher : ce qui arrive du navigateur ne dit que l'intention.
 */

const PATH = "/admin/facebook";
const fields = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));

/* ---------- La clé ---------- */

/** Crée la clé, ou la remplace : l'ancienne cesse aussitôt de valoir. */
export async function rotateFbKeyAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  await rotateApiKey();
  await audit(user.email, "facebook.key.rotate", "integrations/facebookGroups");
  revalidatePath(PATH);
  return saved("Nouvelle clé générée. L'ancienne ne fonctionne plus.");
}

export async function revokeFbKeyAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  await revokeApiKey();
  await audit(user.email, "facebook.key.revoke", "integrations/facebookGroups");
  revalidatePath(PATH);
  return saved("Clé révoquée : l'API refuse désormais toute requête.");
}

export async function saveFbLandingAction(fd: FormData): Promise<AdminResult> {
  await assertAdmin();
  const path = landingPathFrom(String(fd.get("landingPath") ?? ""));
  if (!path) return failed("Un chemin du site est attendu, par exemple / ou /catalogue.", { landingPath: "Chemin du site, commençant par /" });
  await setLandingPath(path);
  revalidatePath(PATH);
  return saved("Page d'arrivée enregistrée. Les liens des messages la suivent, y compris ceux déjà rédigés.");
}

/* ---------- Les groupes ---------- */

const NewGroup = z.object({ url: z.string().trim().min(1, "Lien du groupe obligatoire"), name: z.string().trim().min(1, "Nom du groupe obligatoire").max(150) });

export async function addFbGroupAction(fd: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = NewGroup.safeParse(fields(fd));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  try {
    const { group, existed } = await addFbGroup({ ...parsed.data, addedBy: "admin" });
    if (existed) return failed(`Ce groupe est déjà suivi, sous le nom « ${group.name} ».`);
    await audit(user.email, "facebook.group.add", `fbGroups/${group.slug}`);
    revalidatePath(PATH);
    return saved(`« ${group.name} » ajouté. Son message reste à rédiger.`);
  } catch (err) {
    return failed((err as Error).message);
  }
}

const Slug = z.string().regex(/^[a-z0-9-]{1,80}$/);

/** Adhésion ou onglet, depuis une liste ou un bouton de la ligne. */
const Quick = z.object({
  slug: Slug,
  membership: z.enum(FB_MEMBERSHIPS).optional(),
  status: z.enum(FB_TABS).optional(),
  postStatus: z.enum(FB_POST_STATES).optional(),
});

export async function quickFbGroupAction(fd: FormData): Promise<AdminResult> {
  await assertAdmin();
  const parsed = Quick.safeParse(fields(fd));
  if (!parsed.success) return failed("Requête invalide.");
  const { slug, ...patch } = parsed.data;
  if (!(await getFbGroup(slug))) return failed("Groupe introuvable.");
  await updateFbGroup(slug, patch);
  revalidatePath(PATH);
  return saved(patch.status ? "Groupe déplacé." : "Enregistré.");
}

/** La fiche : nom, note, nombre de membres, message. Le lien du post se saisit sur la ligne. */
export async function saveFbGroupAction(fd: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const raw = fields(fd);
  const slug = Slug.safeParse(raw.slug);
  if (!slug.success) return failed("Requête invalide.");
  const current = await getFbGroup(slug.data);
  if (!current) return failed("Groupe introuvable.");

  const members = raw.members?.trim() ? Number(raw.members.replace(/\s/g, "")) : null;
  const parsed = ApiPatch.safeParse({
    note: raw.note ?? "",
    members: members !== null && Number.isFinite(members) ? Math.round(members) : null,
    message: raw.message ?? null,
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  try {
    const patch = toPatch(parsed.data, siteHost());
    if (raw.name?.trim()) patch.name = raw.name;
    await updateFbGroup(slug.data, patch);
  } catch (err) {
    return failed((err as Error).message, /lien|message/i.test((err as Error).message) ? { message: (err as Error).message } : undefined);
  }
  await audit(user.email, "facebook.group.save", `fbGroups/${slug.data}`);
  revalidatePath(PATH);
  return saved();
}

/**
 * Le lien du post, saisi sur la ligne et enregistré en quittant le champ. Un premier
 * lien part « en attente » et range le groupe dans « Fait » ; un champ vidé retire le post.
 */
export async function setFbPostAction(fd: FormData): Promise<AdminResult> {
  await assertAdmin();
  const slug = Slug.safeParse(fd.get("slug"));
  if (!slug.success) return failed("Requête invalide.");
  const current = await getFbGroup(slug.data);
  if (!current) return failed("Groupe introuvable.");
  let postUrl: string | null;
  try {
    postUrl = postUrlFrom(String(fd.get("postUrl") ?? ""));
  } catch (err) {
    return failed((err as Error).message);
  }
  if (postUrl === current.postUrl) return { ok: true };
  await updateFbGroup(slug.data, { postUrl });
  revalidatePath(PATH);
  return saved(postUrl ? "Lien du post enregistré." : "Post retiré.");
}

/*
 * Le relevé d'un post, rendu par le script Tampermonkey à la page. C'est la page, qui a
 * la session, qui l'enregistre : le script n'en a pas et n'en a pas besoin. Le contenu
 * vient du navigateur, il est donc revalidé champ par champ (`scanFrom`).
 */
export async function recordFbScanAction(slug: string, releve: unknown): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  if (!Slug.safeParse(slug).success) return { ok: false, error: "Requête invalide." };
  try {
    await recordFbScan(slug, releve);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function markFbSeenAction(fd: FormData): Promise<AdminResult> {
  await assertAdmin();
  const slug = Slug.safeParse(fd.get("slug"));
  if (!slug.success) return failed("Requête invalide.");
  await markFbCommentsSeen(slug.data);
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteFbGroupAction(fd: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const slug = Slug.safeParse(fd.get("slug"));
  if (!slug.success) return failed("Requête invalide.");
  await deleteFbGroup(slug.data);
  await audit(user.email, "facebook.group.delete", `fbGroups/${slug.data}`);
  revalidatePath(PATH);
  return saved("Groupe supprimé. Ses clics restent en base.");
}
