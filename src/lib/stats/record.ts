import "server-only";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { recordCartAdd, statsSalt } from "@/lib/db/stats";
import { clientIp, dayKey, hourKey, isBot, visitorHash } from "./keys";

/**
 * Compte un ajout au panier pour le parcours d'achat, depuis une action serveur : même
 * empreinte de visiteur que la balise (IP + navigateur du jour). Administrateurs et
 * robots exclus, comme pour les pages vues.
 */
export async function recordCartAddFromRequest(): Promise<void> {
  const h = await headers();
  const ua = h.get("user-agent");
  if (isBot(ua)) return;
  const user = await getSessionUser().catch(() => null);
  if (user?.isAdmin) return;
  const at = Date.now();
  const day = dayKey(at);
  await recordCartAdd(day, hourKey(at), visitorHash(statsSalt(), day, clientIp(h.get("x-forwarded-for")), ua ?? ""));
}
