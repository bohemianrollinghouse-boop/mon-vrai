import { z } from "zod";
import { findFbGroup, getFbConfig, updateFbGroup } from "@/lib/db/fb-groups";
import { checkMessage, firstIssue } from "@/lib/domain/fb-groups";
import { apiView, denyWithoutKey, finalMessage, groupRef, json, readJson, siteHost } from "@/lib/fb-groups/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ group: string }> };

const notFound = () => json({ error: "groupe non suivi : slug (champ slug de GET /api/fb-groups) ou lien du groupe attendu" }, 404);

/** Le message prêt à poster dans ce groupe ; 409 tant qu'il n'est pas rédigé. */
export async function GET(request: Request, ctx: Ctx) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const group = await findFbGroup(groupRef((await ctx.params).group));
  if (!group) return notFound();
  const config = await getFbConfig();
  const text = finalMessage(group, config);
  if (!text) return json({ error: "aucun message rédigé pour ce groupe", group: apiView(group, config) }, 409);
  return json({ text, raw: group.message, link: apiView(group, config).link, group: apiView(group, config) });
}

const Body = z.object({ text: z.string() }).strict();

/** Écrit (ou réécrit) le message du groupe. Il doit contenir {lien}. */
export async function PUT(request: Request, ctx: Ctx) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: firstIssue(parsed.error) }, 400);
  const checked = checkMessage(parsed.data.text, siteHost());
  if (!checked.ok) return json({ error: checked.error }, 400);
  const group = await findFbGroup(groupRef((await ctx.params).group));
  if (!group) return notFound();
  const next = await updateFbGroup(group.slug, { message: checked.text });
  const config = await getFbConfig();
  return json({ group: apiView(next, config), text: finalMessage(next, config) });
}
