import { findFbGroup, getFbConfig, updateFbGroup } from "@/lib/db/fb-groups";
import { ApiPatch, firstIssue, toPatch } from "@/lib/domain/fb-groups";
import { apiView, denyWithoutKey, finalMessage, groupRef, json, readJson, siteHost } from "@/lib/fb-groups/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ group: string }> };

const notFound = () => json({ error: "groupe non suivi : slug (champ slug de GET /api/fb-groups) ou lien du groupe attendu" }, 404);

/** Un groupe, avec son message prêt à poster (`text`, lien en place). */
export async function GET(request: Request, ctx: Ctx) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const group = await findFbGroup(groupRef((await ctx.params).group));
  if (!group) return notFound();
  const config = await getFbConfig();
  return json({ group: apiView(group, config), text: finalMessage(group, config) });
}

/** Met à jour le suivi d'un groupe. Seuls les champs envoyés changent. */
export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const parsed = ApiPatch.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: firstIssue(parsed.error) }, 400);
  if (Object.keys(parsed.data).length === 0) return json({ error: "rien à modifier (champs : status, membership, members, postUrl, postStatus, note, message)" }, 400);
  const group = await findFbGroup(groupRef((await ctx.params).group));
  if (!group) return notFound();
  try {
    const next = await updateFbGroup(group.slug, toPatch(parsed.data, siteHost()));
    return json({ group: apiView(next, await getFbConfig()) });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
}
