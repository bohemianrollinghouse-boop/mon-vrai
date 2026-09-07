/*
 * Donne (ou retire) le rôle administrateur à un compte existant.
 *
 *   pnpm make-admin steve@exemple.fr            → admin
 *   pnpm make-admin steve@exemple.fr --revoke   → retire le rôle
 *
 * Fonctionne contre l'émulateur (variables *_EMULATOR_HOST) ou contre le vrai projet
 * (GOOGLE_APPLICATION_CREDENTIALS pointant vers un compte de service). Le compte doit
 * déjà exister : la personne s'inscrit d'abord sur le site, puis on l'élève ici.
 *
 * Le rôle est un « custom claim » Firebase : il est lu dans le cookie de session, donc
 * la personne doit se déconnecter et se reconnecter pour qu'il prenne effet.
 */

import { adminAuth } from "@/lib/firebase/admin";

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email || !email.includes("@")) {
    console.error("Usage : pnpm make-admin <email> [--revoke]");
    process.exit(2);
  }
  const grant = flag !== "--revoke";

  const auth = adminAuth();
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    console.error(`Aucun compte pour ${email}. La personne doit d'abord s'inscrire sur le site.`);
    process.exit(1);
  }

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: grant });
  // Invalide les sessions existantes : le nouveau rôle exige une reconnexion.
  await auth.revokeRefreshTokens(user.uid);

  console.log(`${grant ? "Admin accordé à" : "Admin retiré à"} ${email} (uid ${user.uid}). Reconnexion nécessaire.`);
}

main().catch((err) => {
  console.error("échec :", err);
  process.exit(1);
});
