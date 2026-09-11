import "server-only";

/*
 * Déploiement en cours ? Le serveur qui répond est celui de l'ANCIENNE version : il ne
 * peut pas savoir qu'une nouvelle se construit, sauf à le demander à Firebase App
 * Hosting. On interroge donc ses opérations en cours — une liste minuscule, contrairement
 * à celle des rollouts, qui n'accepte ni tri ni filtre et qui grandit sans fin.
 *
 * Le jeton vient du serveur de métadonnées de Cloud Run : aucune clé à gérer, et le
 * compte de service du runtime (firebase-app-hosting-compute) porte déjà
 * `firebaseapphosting.operations.list`. Hors de Cloud Run — en local — le serveur de
 * métadonnées n'existe pas : tout échoue vite et silencieusement, et l'admin n'affiche
 * simplement rien. C'est voulu : ce bandeau est un confort, jamais un point de panne.
 */

const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const LOCATION = process.env.APP_HOSTING_LOCATION || "europe-west4";
const TIMEOUT_MS = 2500;

export type DeployStatus = {
  /** Une construction ou une mise en ligne est en cours. */
  active: boolean;
  /** Depuis quand, en millisecondes epoch. */
  since?: number;
  /** Ce qui est en cours, tel que le nomme App Hosting (« rollout-2026-09-12-003 »). */
  what?: string;
};

/* Jeton gardé en mémoire jusqu'à une minute de sa fin : un sondage toutes les 15 s ne
   doit pas redemander un jeton à chaque fois. */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  try {
    const res = await fetch(METADATA, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;
    cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch {
    return null;
  }
}

function projectId(): string {
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
}

/*
 * `null` signifie « impossible à savoir » (hors Cloud Run, droits manquants, API
 * injoignable) et non « rien en cours » : l'appelant n'affiche alors rien du tout.
 */
export async function deployStatus(): Promise<DeployStatus | null> {
  const project = projectId();
  if (!project) return null;
  const token = await accessToken();
  if (!token) return null;

  const url = `https://firebaseapphosting.googleapis.com/v1beta/projects/${project}/locations/${LOCATION}/operations?filter=done%3Dfalse&pageSize=10`;
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { operations?: { metadata?: { target?: string; createTime?: string } }[] };
    const ops = body.operations ?? [];

    // Seules les mises en ligne nous intéressent : un domaine ou un réglage qui bouge
    // n'est pas un déploiement et n'a rien à annoncer.
    const deploys = ops.filter((o) => /\/(rollouts|builds)\//.test(o.metadata?.target ?? ""));
    if (deploys.length === 0) return { active: false };

    const first = deploys.reduce((a, b) => ((a.metadata?.createTime ?? "") <= (b.metadata?.createTime ?? "") ? a : b));
    const since = first.metadata?.createTime ? new Date(first.metadata.createTime).getTime() : undefined;
    return { active: true, since: Number.isNaN(since) ? undefined : since, what: first.metadata?.target?.split("/").pop() };
  } catch {
    return null;
  }
}
