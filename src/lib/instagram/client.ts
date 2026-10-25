import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Client Instagram — « Instagram API with Instagram Login ».
 *
 * C'est le montage sans Page Facebook : le compte professionnel se connecte avec ses
 * propres identifiants, et tout passe par graph.instagram.com. L'autre montage (API
 * via Facebook Login) demande une Page liée et un jeton de Page ; il n'apporte ici que
 * des pièces à faire tenir ensemble, pour les mêmes réponses aux mêmes commentaires.
 *
 * Deux secrets, et un seul est vraiment secret : l'identifiant de l'application paraît
 * dans l'URL de consentement — il est public par construction —, la clé ne sort jamais
 * d'ici. Sans l'une ni l'autre, tout renvoie null plutôt que de lever : l'écran doit
 * pouvoir s'afficher et dire « pas encore configuré », exactement comme Boxtal.
 */

/*
 * La version figée plutôt que l'absence de version : sans numéro, Meta sert la plus
 * ancienne encore en vie et la bascule un jour sans prévenir. v26.0 est la version
 * courante (29 juillet 2026) ; chacune vit environ deux ans.
 */
const VERSION = process.env.INSTAGRAM_API_VERSION ?? "v26.0";
const GRAPH = `https://graph.instagram.com/${VERSION}`;

const appId = () => process.env.INSTAGRAM_APP_ID ?? "";
const appSecret = () => process.env.INSTAGRAM_APP_SECRET ?? "";

export const instagramConfigured = (): boolean => Boolean(appId() && appSecret());

/** Rendu à l'écran pour composer l'URL de consentement — public, contrairement à la clé. */
export const instagramAppId = (): string => appId();

/*
 * Ce qu'on demande au consentement. `basic` pour lire le compte et ses publications,
 * `comments` pour lire et répondre sous un post, `messages` pour le DM. On ne demande
 * pas la publication de contenu : ce dispositif répond, il ne poste pas, et une
 * permission qu'on ne sait pas justifier est une permission qui fait échouer la revue
 * Meta le jour où il faut la passer.
 */
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"];

/* ---------- Connexion ---------- */

/*
 * Le cookie qui porte l'état du voyage OAuth. Il est nommé ici, et non dans la route
 * de retour : l'action qui part et la route qui revient doivent lire le même nom, et
 * faire dépendre une action serveur d'un module de route reviendrait à en charger les
 * gestionnaires pour une chaîne de caractères.
 */
export const IG_STATE_COOKIE = "mv_ig_state";

/*
 * L'adresse de retour, calculée et jamais saisie deux fois : Meta exige qu'elle soit
 * IDENTIQUE au caractère près entre la demande de consentement et l'échange du code,
 * et qu'elle figure telle quelle dans la liste du tableau de bord. Deux écritures du
 * même chemin, c'est l'erreur « redirect_uri mismatch » et une heure perdue.
 *
 * En HTTPS obligatoirement — Instagram refuse http, localhost compris. La connexion se
 * fait donc depuis le site en ligne, ou derrière un tunnel.
 */
export const instagramRedirectUri = (): string => `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/api/instagram/connexion`;

/*
 * L'URL où l'on envoie l'utilisateur pour qu'il accepte. `state` est relu au retour et
 * comparé : sans lui, n'importe qui pourrait nous faire avaler un code d'autorisation
 * obtenu ailleurs.
 */
export function authorizeUrl(redirectUri: string, state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", IG_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenExchange = { access_token: string; user_id: string | number; permissions?: string | string[] };

async function readJson<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    /* Meta range le détail dans `error.message` ; sans lui on ne sait littéralement rien. */
    const err = (json as { error?: { message?: string; code?: number; error_user_msg?: string } } | null)?.error;
    const detail = err?.error_user_msg || err?.message || text.slice(0, 200);
    throw new Error(`Instagram ${what} → ${res.status}${detail ? ` (${detail})` : ""}`);
  }
  return json as T;
}

/*
 * Le code d'autorisation contre un jeton court. Le corps part en formulaire et non en
 * JSON : c'est le seul appel de tout ce fichier qui l'exige, et Meta répond par une
 * erreur opaque quand on se trompe.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; userId: string; permissions: string[] }> {
  const body = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await readJson<TokenExchange>(res, "échange du code");
  const perms = Array.isArray(data.permissions) ? data.permissions : String(data.permissions ?? "").split(",").filter(Boolean);
  return { accessToken: data.access_token, userId: String(data.user_id), permissions: perms };
}

/** Le jeton court (une heure) contre le jeton long (60 jours). */
export async function toLongLived(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${GRAPH}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret());
  url.searchParams.set("access_token", shortToken);
  const data = await readJson<{ access_token: string; expires_in: number }>(await fetch(url, { cache: "no-store" }), "jeton long");
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/*
 * Prolonge de 60 jours. Meta refuse sur un jeton de moins de 24 heures (il n'y a rien
 * à prolonger) et sur un jeton expiré (il n'y a plus rien à prolonger) : les deux cas
 * sont des erreurs, et c'est l'appelant qui décide s'il faut alerter.
 */
export async function refreshLongLived(token: string): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const data = await readJson<{ access_token: string; expires_in: number }>(await fetch(url, { cache: "no-store" }), "renouvellement du jeton");
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/* ---------- Le compte ---------- */

/*
 * `user_id` et non `id` : sur graph.instagram.com, `id` renvoie l'identifiant d'app et
 * `user_id` l'identifiant du compte professionnel. C'est ce dernier que les webhooks
 * citent, et donc le seul qui permette de reconnaître nos propres commentaires.
 */
export async function fetchProfile(token: string): Promise<{ userId: string; username: string }> {
  const url = new URL(`${GRAPH}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", token);
  const data = await readJson<{ user_id?: string | number; id?: string; username?: string }>(await fetch(url, { cache: "no-store" }), "profil");
  return { userId: String(data.user_id ?? data.id ?? ""), username: data.username ?? "" };
}

export type IgMedia = { id: string; caption: string; mediaType: string; thumbnail: string; permalink: string; timestamp: string };

/** Les publications récentes, pour qu'une règle se vise à la souris et non à l'identifiant. */
export async function listMedia(token: string, limit = 25): Promise<IgMedia[]> {
  const url = new URL(`${GRAPH}/me/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", token);
  const data = await readJson<{ data?: { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string }[] }>(
    await fetch(url, { cache: "no-store" }),
    "publications",
  );
  return (data.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? "",
    mediaType: m.media_type ?? "",
    /* Une vidéo n'a pas de `media_url` affichable : sa vignette est dans `thumbnail_url`. */
    thumbnail: m.thumbnail_url || m.media_url || "",
    permalink: m.permalink ?? "",
    timestamp: m.timestamp ?? "",
  }));
}

/* ---------- Webhooks ---------- */

/*
 * Abonne l'application aux événements du compte. Sans cet appel, l'abonnement déclaré
 * dans le tableau de bord Meta reste lettre morte : il dit quels champs l'app PEUT
 * recevoir, celui-ci dit pour quel compte elle les reçoit. C'est l'oubli classique, et
 * il ne se signale que par un silence complet.
 */
export async function subscribeWebhooks(token: string): Promise<void> {
  const url = new URL(`${GRAPH}/me/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "comments,messages");
  url.searchParams.set("access_token", token);
  await readJson(await fetch(url, { method: "POST", cache: "no-store" }), "abonnement aux webhooks");
}

/** Ce à quoi le compte est abonné, tel que Meta le voit — pour que l'écran ne le devine pas. */
export async function readSubscriptions(token: string): Promise<string[]> {
  const url = new URL(`${GRAPH}/me/subscribed_apps`);
  url.searchParams.set("access_token", token);
  const data = await readJson<{ data?: { subscribed_fields?: string[] }[] }>(await fetch(url, { cache: "no-store" }), "abonnements");
  return data.data?.[0]?.subscribed_fields ?? [];
}

/*
 * La signature du webhook : HMAC-SHA256 du corps BRUT avec la clé de l'application.
 * Le corps brut, et jamais un JSON re-sérialisé — un espace de différence et la
 * signature ne tombe plus. Comparaison à temps constant, comme pour Boxtal et Stripe.
 */
export function verifySignature(raw: string, header: string | null): boolean {
  const secret = appSecret();
  if (!secret || !header) return false;
  const given = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** Le mot de passe de la poignée de main initiale (GET du webhook), choisi par nous. */
export const webhookVerifyToken = (): string => process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";

/* ---------- Répondre ---------- */

/*
 * La réponse publique sous un commentaire. C'est elle qui, renvoyée par webhook, ferait
 * boucler le dispositif sur lui-même si `ownComment` ne l'arrêtait pas en amont.
 */
export async function replyToComment(token: string, commentId: string, message: string): Promise<string> {
  const url = new URL(`${GRAPH}/${encodeURIComponent(commentId)}/replies`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
    cache: "no-store",
  });
  const data = await readJson<{ id?: string }>(res, "réponse publique");
  return data.id ?? "";
}

/*
 * Un message privé. Le destinataire se désigne de deux façons, et c'est toute la
 * subtilité du dossier :
 *  — `{ id }` : la personne, dans les 24 h après SON message ;
 *  — `{ comment_id }` : la personne qui a laissé ce commentaire, dans les 7 jours, et
 *    UNE seule fois pour ce commentaire. C'est la « réponse privée », le seul moyen
 *    d'ouvrir une conversation que la personne n'a pas ouverte.
 * Hors de ces deux fenêtres, Meta refuse — et c'est pour cela qu'on ne peut pas écrire
 * à un nouvel abonné.
 */
export async function sendMessage(token: string, recipient: { id: string } | { comment_id: string }, text: string): Promise<string> {
  const url = new URL(`${GRAPH}/me/messages`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient, message: { text } }),
    cache: "no-store",
  });
  const data = await readJson<{ message_id?: string }>(res, "message privé");
  return data.message_id ?? "";
}

/*
 * La réponse privée à un commentaire — le « commente LIVRE et je t'envoie le lien ».
 *
 * Meta documente DEUX routes pour exactement ce geste, selon la page où l'on tombe :
 * `/me/messages` avec `recipient: { comment_id }` dans le guide de la messagerie, et
 * `/{comment-id}/private_replies` dans la référence des commentaires. Elles ne sont
 * pas toujours ouvertes ensemble suivant le montage de l'application, et le refus
 * ressemble à une panne générale alors qu'il ne concerne qu'une adresse.
 *
 * On tente donc la première et on retombe sur la seconde. Le repli ne coûte qu'un
 * aller-retour dans le cas rare, et il épargne une demi-journée à chercher pourquoi
 * « ça ne marche pas » alors que tout le reste marche. L'erreur gardée est celle de la
 * PREMIÈRE tentative : c'est la route principale, c'est son motif qui renseigne.
 */
export async function privateReply(token: string, commentId: string, text: string): Promise<string> {
  try {
    return await sendMessage(token, { comment_id: commentId }, text);
  } catch (first) {
    try {
      const url = new URL(`${GRAPH}/${encodeURIComponent(commentId)}/private_replies`);
      url.searchParams.set("access_token", token);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
        cache: "no-store",
      });
      const data = await readJson<{ id?: string; message_id?: string }>(res, "réponse privée");
      return data.message_id ?? data.id ?? "";
    } catch {
      throw first;
    }
  }
}
