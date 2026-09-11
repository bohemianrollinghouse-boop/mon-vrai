import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";

/*
 * Session côté serveur. Le navigateur s'authentifie auprès de Firebase Auth, obtient
 * un jeton d'identité, et l'échange contre un cookie de session signé par Firebase
 * (route /api/session). Ensuite, tout se vérifie ici, côté serveur : ni la base ni
 * les actions n'ont jamais à faire confiance au client.
 *
 * Le rôle admin est un *custom claim* posé par le seed (dev) ou par un admin existant.
 */

export const SESSION_COOKIE = "__session";
const SESSION_DAYS = 14;

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
  /**
   * Vrai si Firebase a vérifié l'adresse (lien de confirmation, ou fournisseur Google).
   * Tout rattachement de données par e-mail (commandes invité, factures) l'exige : sans
   * ça, créer un compte avec l'adresse d'un tiers suffirait à lire ses commandes.
   */
  emailVerified: boolean;
  isAdmin: boolean;
  /** Identifiant du partenaire, s'il en est un. Ouvre /partenaire. */
  influencerId: string;
};

export async function createSession(idToken: string): Promise<void> {
  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  (await cookies()).set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn / 1000,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** L'utilisateur courant, ou null. Ne lève jamais : un cookie invalide vaut « déconnecté ». */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      name: (decoded.name as string | undefined) ?? "",
      emailVerified: decoded.email_verified === true,
      isAdmin: decoded.admin === true,
      influencerId: typeof decoded.influencer === "string" ? decoded.influencer : "",
    };
  } catch {
    return null;
  }
}

export async function requireUser(returnTo = "/compte"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/compte/connexion?retour=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/compte/connexion?retour=/admin");
  if (!user.isAdmin) redirect("/compte");
  return user;
}

/** Pour les actions serveur de l'admin : lève au lieu de rediriger. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error("Accès réservé à l'administration");
  return user;
}

/*
 * Les rôles vivent dans les mêmes custom claims : les écrire sans fusionner effacerait
 * l'autre. Un administrateur peut être partenaire, et inversement.
 */
async function mergeClaims(uid: string, patch: Record<string, unknown>): Promise<void> {
  const auth = adminAuth();
  const current = (await auth.getUser(uid)).customClaims ?? {};
  await auth.setCustomUserClaims(uid, { ...current, ...patch });
}

export async function setAdminClaim(uid: string, isAdmin: boolean): Promise<void> {
  await mergeClaims(uid, { admin: isAdmin });
}

/** Marque (ou démarque) le compte comme partenaire, en conservant les autres rôles. */
export async function setInfluencerClaim(uid: string, influencerId: string): Promise<void> {
  await mergeClaims(uid, { influencer: influencerId || null });
}

/** Réservé à l'espace partenaire : redirige si le compte n'en est pas un. */
export async function requireInfluencer(): Promise<SessionUser & { influencerId: string }> {
  const user = await getSessionUser();
  if (!user) redirect("/compte/connexion?retour=/partenaire");
  if (!user.influencerId) redirect("/compte");
  return user as SessionUser & { influencerId: string };
}
