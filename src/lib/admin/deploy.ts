import "server-only";
import { rolloutStatus, type DeployStatus, type Rollout } from "./rollouts";

export type { DeployStatus } from "./rollouts";

/*
 * Déploiement en cours ? Le serveur qui répond est celui de l'ANCIENNE version : il ne
 * peut pas savoir qu'une nouvelle se construit, sauf à le demander à Firebase App
 * Hosting.
 *
 * On lit les rollouts, et non les opérations : celles-ci ne tracent que les appels
 * d'API, pas les mises en ligne déclenchées par un push (vérifié — un rollout en cours
 * y est invisible). La liste des rollouts, elle, n'accepte ni tri ni filtre (`orderBy`
 * est refusé, `filter=state=…` ne renvoie jamais rien) : on la parcourt donc en entier
 * et on garde le plus récent. Cent par page, quelques pages au plus, et le résultat est
 * gardé dix secondes — plusieurs onglets d'admin ne multiplient pas les appels.
 *
 * Le jeton vient du serveur de métadonnées de Cloud Run : aucune clé à gérer, et le
 * compte de service du runtime (firebase-app-hosting-compute) porte déjà
 * `firebaseapphosting.rollouts.list`. Hors de Cloud Run — en local — ce serveur n'existe
 * pas : tout échoue vite et silencieusement, et l'admin n'affiche rien. C'est voulu :
 * ce bandeau est un confort, jamais un point de panne.
 */

const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const LOCATION = process.env.APP_HOSTING_LOCATION || "europe-west4";
const TIMEOUT_MS = 2500;
const MAX_PAGES = 10;
const CACHE_MS = 10_000;

let token: { value: string; expiresAt: number } | null = null;
let cached: { at: number; status: DeployStatus | null } | null = null;

async function accessToken(): Promise<string | null> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  try {
    const res = await fetch(METADATA, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  } catch {
    return null;
  }
}

const projectId = () => process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";

/*
 * `null` signifie « impossible à savoir » (hors Cloud Run, droits manquants, API
 * injoignable) et non « rien en cours » : l'appelant n'affiche alors rien du tout.
 */
export async function deployStatus(): Promise<DeployStatus | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.status;
  const status = await readStatus();
  cached = { at: Date.now(), status };
  return status;
}

async function readStatus(): Promise<DeployStatus | null> {
  const project = projectId();
  if (!project) return null;
  const bearer = await accessToken();
  if (!bearer) return null;

  const base = `https://firebaseapphosting.googleapis.com/v1beta/projects/${project}/locations/${LOCATION}/backends/-/rollouts?pageSize=100`;
  const all: Rollout[] = [];
  let pageToken = "";

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await fetch(pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base, {
        headers: { authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { rollouts?: Rollout[]; nextPageToken?: string };
      all.push(...(body.rollouts ?? []));
      pageToken = body.nextPageToken ?? "";
      if (!pageToken) break;
    }
  } catch {
    return null;
  }

  return rolloutStatus(all, Date.now());
}
