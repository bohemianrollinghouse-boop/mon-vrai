import { checkFbGroup, getFbConfig } from "@/lib/db/fb-groups";
import { apiView, denyWithoutKey, json } from "@/lib/fb-groups/api";

export const dynamic = "force-dynamic";

/**
 * Ce groupe est-il déjà suivi ? `exists` : à la même adresse ; `sameName` : sous le même
 * nom à une autre adresse (un groupe a souvent un alias et un numéro). Ne pas l'ajouter
 * si l'un des deux est positif.
 */
export async function GET(request: Request) {
  const denied = await denyWithoutKey(request);
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const url = sp.get("url") ?? "";
  const { groupUrl, exists, sameName } = await checkFbGroup(url, sp.get("name") ?? "");
  if (!groupUrl && !sp.get("name")) return json({ error: "url : lien de groupe Facebook attendu (https://www.facebook.com/groups/…)" }, 400);
  const config = await getFbConfig();
  return json({ groupUrl, exists: !!exists, group: exists ? apiView(exists, config) : null, sameName: sameName.map((g) => apiView(g, config)) });
}
