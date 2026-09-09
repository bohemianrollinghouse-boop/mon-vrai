import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import { recordCartAdd, statsSalt } from "@/lib/db/stats";
import { dayKey, hourKey, visitorHash } from "./keys";

/**
 * Compte un ajout au panier pour le parcours d'achat, depuis une action serveur. Le
 * « visiteur » est le panier (un par navigateur, cookie httpOnly posé par le serveur) :
 * deux ajouts du même panier dans la journée ne comptent qu'une personne. Administrateurs
 * exclus, comme pour les pages vues.
 */
export async function recordCartAddFromRequest(cartId: string): Promise<void> {
  const user = await getSessionUser().catch(() => null);
  if (user?.isAdmin) return;
  const at = Date.now();
  const day = dayKey(at);
  await recordCartAdd(day, hourKey(at), visitorHash(statsSalt(), day, `cart:${cartId}`));
}
