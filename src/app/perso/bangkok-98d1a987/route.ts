import { readFile } from "node:fs/promises";
import path from "node:path";

/*
 * Page privée : la carte des trucs à faire à Bangkok (lieux, horaires, vidéos Insta),
 * pensée pour le téléphone. Comme l'ancienne page Loy Krathong, c'est un document HTML
 * autonome — carte Leaflet sur OpenStreetMap, styles et script compris — qui ne doit pas
 * hériter du gabarit du site : la route renvoie le fichier tel quel.
 *
 * Les lieux sont écrits dans le fichier (`content/perso/bangkok.html`) : le navigateur ne
 * lit ni n'écrit jamais Firestore, donc en ajouter un, c'est modifier ce fichier et
 * redéployer.
 *
 * Pourquoi pas `public/` : il n'arrive pas en production. `force-static` fige la réponse
 * pendant `next build` : le HTML est lu à ce moment-là et part dans la sortie standalone.
 *
 * L'adresse n'est liée nulle part, ne figure pas au plan du site, et la page est marquée
 * noindex — en meta dans le document et en en-tête ici.
 */
export const dynamic = "force-static";

export async function GET() {
  const html = await readFile(path.join(process.cwd(), "content", "perso", "bangkok.html"), "utf8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
