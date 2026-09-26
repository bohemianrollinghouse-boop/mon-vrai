import "server-only";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { excludedIps, recordCartAdd, statsSalt } from "@/lib/db/stats";
import { clientIp, dayKey, hourKey, isExcludedIp, visitorHash } from "./keys";

/**
 * Compte un ajout au panier pour le parcours d'achat, depuis une action serveur. Le
 * « visiteur » est le panier (un par navigateur, cookie httpOnly posé par le serveur) :
 * deux ajouts du même panier dans la journée ne comptent qu'une personne. Administrateurs
 * et adresses exclues écartés, comme pour les pages vues — sans quoi le parcours d'achat
 * compterait un essai que le reste de l'écran ne compte pas.
 */
export async function recordCartAddFromRequest(cartId: string): Promise<void> {
  const user = await getSessionUser().catch(() => null);
  if (user?.isAdmin) return;
  if (isExcludedIp(clientIp(await headers()), await excludedIps().catch(() => []))) return;
  const at = Date.now();
  const day = dayKey(at);
  await recordCartAdd(day, hourKey(at), visitorHash(statsSalt(), day, `cart:${cartId}`));
}
