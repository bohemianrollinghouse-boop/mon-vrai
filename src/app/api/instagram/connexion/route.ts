import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/session";
import { setConnection } from "@/lib/db/instagram";
import { IgConnection } from "@/lib/domain/instagram";
import { IG_STATE_COOKIE, exchangeCode, fetchProfile, instagramRedirectUri, subscribeWebhooks, toLongLived } from "@/lib/instagram/client";

/*
 * Le retour d'Instagram après le consentement. Quatre gestes à la suite, et aucun ne
 * peut manquer : le code devient un jeton court, le jeton court un jeton long (60
 * jours), on relit qui l'on est, et on abonne le compte aux webhooks.
 *
 * Le dernier est celui qu'on oublie. Déclarer l'adresse du webhook dans le tableau de
 * bord Meta dit quels événements l'APPLICATION peut recevoir ; `subscribed_apps` dit
 * pour QUEL COMPTE elle les reçoit. Sans lui tout semble en place et il ne se passe
 * rien, jamais, sans le moindre message d'erreur.
 */

export const dynamic = "force-dynamic";

const back = (request: Request, params: Record<string, string>) => {
  const url = new URL("/admin/instagram", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
};

export async function GET(request: Request) {
  /* Le rôle est vérifié ici aussi : cette adresse écrit la connexion du compte. */
  const user = await requireAdmin();
  const params = new URL(request.url).searchParams;

  /* Refus au consentement : Meta renvoie son motif, on le répète plutôt que de taire. */
  const denied = params.get("error_description") || params.get("error");
  if (denied) return back(request, { erreur: denied });

  const code = params.get("code");
  if (!code) return back(request, { erreur: "Instagram n'a renvoyé aucun code." });

  /*
   * L'état est comparé à celui qu'on a posé en partant. C'est ce qui empêche qu'on nous
   * fasse avaler un code obtenu ailleurs — le cookie est le seul à pouvoir le prouver.
   */
  const jar = await cookies();
  const expected = jar.get(IG_STATE_COOKIE)?.value ?? "";
  if (!expected || params.get("state") !== expected) {
    return back(request, { erreur: "Connexion expirée ou falsifiée. Recommencer depuis l'admin." });
  }

  try {
    const short = await exchangeCode(code, instagramRedirectUri());
    const long = await toLongLived(short.accessToken);
    const profile = await fetchProfile(long.accessToken);

    const connection = IgConnection.parse({
      igUserId: profile.userId || short.userId,
      username: profile.username,
      accessToken: long.accessToken,
      expiresAt: Date.now() + long.expiresIn * 1000,
      /* Les permissions RÉELLEMENT accordées, et non celles demandées. */
      scopes: short.permissions,
      connectedAt: Date.now(),
      refreshedAt: Date.now(),
    });
    await setConnection(connection);

    /*
     * L'abonnement en dernier, et son échec n'annule pas la connexion : le compte est
     * bien relié, il manque seulement de recevoir les notifications. L'écran propose un
     * bouton pour le refaire, ce qui vaut mieux que de tout redemander.
     */
    let warning = "";
    try {
      await subscribeWebhooks(long.accessToken);
    } catch (err) {
      warning = err instanceof Error ? err.message : String(err);
    }

    await audit(user.email, "instagram.connect", `instagram/${connection.igUserId}`, connection.username);
    const res = back(request, warning ? { ok: connection.username, avertissement: warning } : { ok: connection.username });
    res.cookies.delete(IG_STATE_COOKIE);
    return res;
  } catch (err) {
    return back(request, { erreur: err instanceof Error ? err.message : String(err) });
  }
}
