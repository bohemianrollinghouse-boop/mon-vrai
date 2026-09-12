/*
 * Ménage des recadrages de newsletter déposés au mauvais endroit.
 *
 * Les dérivées ont d'abord été écrites dans `newsletter/crops/`, hors du seul préfixe que
 * `storage.rules` ouvre à la lecture publique : elles existaient, mais Firebase en
 * refusait l'accès et le destinataire voyait un carré vide. Elles vivent désormais sous
 * `media/newsletter-crops/`, et celles de l'ancien chemin ne servent plus à rien —
 * personne ne peut les lire, et plus aucun e-mail n'y renvoie.
 *
 * Sans risque par défaut : il n'efface rien tant qu'on ne passe pas --apply.
 *
 *   # répétition à blanc, sur le bucket visé par l'environnement chargé
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/clean-newsletter-crops.ts
 *   # puis, seulement quand la liste est conforme
 *   … scripts/clean-newsletter-crops.ts --apply
 *
 * Idempotent : relancé, il ne trouve plus rien et ne fait rien.
 *
 * Il ne touche QUE `newsletter/crops/`. Le chemin en service (`media/newsletter-crops/`)
 * est refusé explicitement plus bas : une faute de frappe ne doit pas pouvoir effacer les
 * dérivées dont les newsletters déjà envoyées se servent encore.
 */
import { storage } from "@/lib/firebase/admin";

/** L'ancien préfixe, abandonné. Volontairement écrit en dur : ce script n'a qu'un seul objet. */
const ANCIEN = "newsletter/crops/";

/** Le préfixe en service. Jamais touché — les e-mails déjà partis y renvoient. */
const EN_SERVICE = "media/newsletter-crops/";

async function main() {
  const apply = process.argv.includes("--apply");
  const bucket = storage().bucket();

  if (ANCIEN.startsWith(EN_SERVICE) || EN_SERVICE.startsWith(ANCIEN)) {
    throw new Error("Les deux préfixes se recouvrent : refus d'effacer quoi que ce soit.");
  }

  console.log(`Bucket : ${bucket.name}`);
  console.log(`Préfixe visé : ${ANCIEN}`);
  console.log(`Préfixe protégé : ${EN_SERVICE}\n`);

  const [fichiers] = await bucket.getFiles({ prefix: ANCIEN });
  if (fichiers.length === 0) {
    console.log("Rien à effacer : aucun fichier sous l'ancien préfixe.");
    return;
  }

  let octets = 0;
  for (const f of fichiers) {
    const taille = Number(f.metadata.size ?? 0);
    octets += taille;
    console.log(`  ${f.name}  (${Math.round(taille / 1024)} Ko)`);
  }
  console.log(`\n${fichiers.length} fichier(s), ${Math.round(octets / 1024)} Ko au total.`);

  if (!apply) {
    console.log("\nRépétition à blanc : rien n'a été effacé. Relancer avec --apply pour le faire.");
    return;
  }

  let efface = 0;
  for (const f of fichiers) {
    // Ceinture et bretelles : on revérifie le préfixe de CHAQUE objet avant de l'effacer.
    if (!f.name.startsWith(ANCIEN)) continue;
    await f.delete({ ignoreNotFound: true });
    efface += 1;
  }
  console.log(`\n${efface} fichier(s) effacé(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
