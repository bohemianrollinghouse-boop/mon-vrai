import { readFile } from "node:fs/promises";
import path from "node:path";

/*
 * Page privée : le parcours de la soirée Loy Krathong à Bangkok (24 novembre 2026).
 * Rien à voir avec la boutique — c'est un document HTML autonome, avec sa carte
 * Leaflet, ses styles et son script, qui ne doit pas hériter du gabarit du site.
 * D'où une route qui renvoie le fichier tel quel plutôt qu'une page.
 *
 * Pourquoi pas `public/` : il n'arrive pas en production (voir « Partage : l'image
 * doit vivre dans le paquet déployé, pas dans public/ »). `force-static` fige la
 * réponse pendant `next build` : le HTML est lu à ce moment-là et part dans la
 * sortie standalone, sans aucune lecture disque en production.
 *
 * L'adresse n'est liée nulle part, ne figure pas au plan du site, et la page est
 * marquée noindex — en meta dans le document et en en-tête ici.
 */
export const dynamic = "force-static";

export async function GET() {
  const html = await readFile(path.join(process.cwd(), "content", "perso", "loy-krathong.html"), "utf8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
