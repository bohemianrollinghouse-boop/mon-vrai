import "server-only";
import { adminAuth } from "@/lib/firebase/admin";

/*
 * Ce que Firebase Auth sait du compte d'un partenaire, et que Firestore ignore : la
 * dernière connexion, surtout. Elle dit si l'espace sert vraiment, là où `activatedAt`
 * ne dit que le jour où le mot de passe a été choisi.
 *
 * Lecture faillible par nature (compte supprimé côté Auth, émulateur éteint) : on rend
 * null plutôt que de faire échouer la fiche entière pour une date.
 */
export type InfluencerAccount = { lastSignInAt: number | null; createdAt: number | null; disabled: boolean };

export async function influencerAccount(uid: string): Promise<InfluencerAccount | null> {
  if (!uid) return null;
  try {
    const user = await adminAuth().getUser(uid);
    const at = (iso?: string) => (iso ? new Date(iso).getTime() || null : null);
    return { lastSignInAt: at(user.metadata.lastSignInTime), createdAt: at(user.metadata.creationTime), disabled: user.disabled };
  } catch {
    return null;
  }
}
