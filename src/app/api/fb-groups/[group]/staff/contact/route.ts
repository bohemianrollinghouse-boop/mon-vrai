import { findFbGroup, getFbConfig, recordFbStaffContact } from "@/lib/db/fb-groups";
import { ApiStaffContact, firstIssue } from "@/lib/domain/fb-groups";
import { apiView, denyWithoutKey, groupRef, json, readJson } from "@/lib/fb-groups/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ group: string }> };

/**
 * Note qu'on a écrit à un admin ou un modérateur du groupe : le lien de la conversation
 * Messenger et le message envoyé. La personne est retrouvée par son profil, sinon par son
 * nom ; absente, elle est ajoutée (rôle alors obligatoire). La date du contact est posée par
 * le serveur (`applyStaffContact`).
 */
export async function POST(request: Request, ctx: Ctx) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const parsed = ApiStaffContact.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: firstIssue(parsed.error) }, 400);
  const group = await findFbGroup(groupRef((await ctx.params).group));
  if (!group) return json({ error: "groupe non suivi : slug (champ slug de GET /api/fb-groups) ou lien du groupe attendu" }, 404);
  try {
    const next = await recordFbStaffContact(group.slug, parsed.data);
    return json({ group: apiView(next, await getFbConfig()) });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
}
