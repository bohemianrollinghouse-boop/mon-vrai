/*
 * Une seule adresse pour le site : contact@monvrai.fr.
 *
 * Le site n'a qu'une boîte. Une autre adresse affichée quelque part — `pro@monvrai.fr`
 * sur la page « Vous êtes pro ? », par exemple — est un lien `mailto:` vers nulle part :
 * le message part et personne ne le reçoit.
 *
 * Ce script relit le CONTENU du site (pages, réglages, contrats, menus, produits) et
 * remplace toute adresse du domaine qui ne serait pas la bonne. Il ne touche jamais aux
 * collections de personnes — clients, commandes, partenaires, abonnés, signatures : leurs
 * adresses sont les leurs, et n'ont rien à voir avec celle de la boutique.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/fix-emails.ts [--apply]
 */
import { db } from "@/lib/firebase/admin";

const APPLY = process.argv.includes("--apply");
const BONNE = "contact@monvrai.fr";

/* Le contenu du site, et lui seul. Tout le reste appartient à des gens. */
const CONTENU = ["pages", "content", "settings", "contracts", "menus", "products"];
const RE = /[a-zA-Z0-9._%+-]+@monvrai\.fr/g;

async function main() {
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");
  let touched = 0;

  for (const name of CONTENU) {
    const snap = await db().collection(name).limit(500).get();
    for (const doc of snap.docs) {
      const before = JSON.stringify(doc.data());
      const mauvaises = [...new Set(before.match(RE) ?? [])].filter((e) => e.toLowerCase() !== BONNE);
      if (mauvaises.length === 0) continue;

      const after = before.replace(RE, (e) => (e.toLowerCase() === BONNE ? e : BONNE));
      console.log(`~ ${name}/${doc.id} · ${mauvaises.join(", ")} → ${BONNE}`);
      touched += 1;
      if (APPLY) await doc.ref.set(JSON.parse(after));
    }
  }

  if (touched === 0) console.log("Aucune adresse à corriger : le site n'en affiche qu'une.");
  console.log(APPLY ? "\nTerminé." : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
