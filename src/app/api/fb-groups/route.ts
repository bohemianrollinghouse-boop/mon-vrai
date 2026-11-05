import { addFbGroup, getFbConfig, listFbGroups } from "@/lib/db/fb-groups";
import { ApiNewGroup, LOT_MAX, addedToday, checkMessage, checkStaff, firstIssue } from "@/lib/domain/fb-groups";
import { apiView, denyWithoutKey, json, readJson, siteHost } from "@/lib/fb-groups/api";

/*
 * API des Campagnes Facebook, lue par Claude dans Chrome (voir /admin/facebook et
 * openapi.json, qui en est la documentation). Lister, vérifier, ajouter, suivre :
 * rien ne s'y supprime, et ni le nom ni le slug d'un groupe ne s'y changent.
 */

export const dynamic = "force-dynamic";

/** Tous les groupes suivis, tous onglets, et le nombre ajoutés aujourd'hui par l'agent (règle du rythme). */
export async function GET(request: Request) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const [groups, config] = await Promise.all([listFbGroups(), getFbConfig()]);
  groups.sort((a, b) => b.createdAt - a.createdAt);
  return json({ count: groups.length, addedToday: addedToday(groups, Date.now()), groups: groups.map((g) => apiView(g, config)) });
}

/**
 * Ajoute un groupe `{url, name, …}` ou un lot `{groups: [{…}, …]}`. Un groupe déjà
 * suivi n'est pas une erreur : il revient avec `existed: true`, inchangé. Toujours 200
 * pour un lot bien formé ; le sort de chaque groupe est dans `results`.
 */
export async function POST(request: Request) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const body = (await readJson(request)) as { groups?: unknown } | null;
  const batch: unknown[] = Array.isArray(body?.groups) ? body.groups : body ? [body] : [];
  if (batch.length === 0 || batch.length > LOT_MAX) return json({ error: `entre 1 et ${LOT_MAX} groupes par requête` }, 400);

  const [config, host] = [await getFbConfig(), siteHost()];
  const results: { url: string; ok: boolean; existed?: boolean; error?: string; warning?: string; group?: ReturnType<typeof apiView> }[] = [];
  for (const entry of batch) {
    const url = String((entry as { url?: unknown })?.url ?? "");
    const parsed = ApiNewGroup.safeParse(entry);
    if (!parsed.success) {
      results.push({ url, ok: false, error: firstIssue(parsed.error) });
      continue;
    }
    try {
      let message: string | null = null;
      if (parsed.data.message?.trim()) {
        const checked = checkMessage(parsed.data.message, host);
        if (!checked.ok) throw new Error(checked.error);
        message = checked.text;
      }
      const staff = parsed.data.staff ? checkStaff(parsed.data.staff) : undefined;
      const { group, existed } = await addFbGroup({ ...parsed.data, message, staff, addedBy: "agent" });
      const ignored = [message && "le message : PUT /{slug}/message", staff?.length && "les admins et modérateurs : PATCH /{slug} avec staff"].filter(Boolean);
      results.push({ url, ok: true, existed, group: apiView(group, config), ...(existed && ignored.length ? { warning: `groupe déjà suivi : rien n'a été modifié. Pour changer ${ignored.join(" ; ")}` } : {}) });
    } catch (err) {
      results.push({ url, ok: false, error: (err as Error).message });
    }
  }
  return json({
    added: results.filter((r) => r.ok && !r.existed).length,
    existed: results.filter((r) => r.ok && r.existed).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
