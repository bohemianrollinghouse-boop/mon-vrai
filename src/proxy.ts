import { NextResponse, type NextRequest } from "next/server";

/*
 * Proxy (l'ex-middleware de Next). Deux rôles, volontairement minces :
 *  - transmettre le chemin courant aux composants serveur (`x-pathname`), pour marquer
 *    l'entrée de menu active sans composant client ;
 *  - rediriger les liens influenceurs (?ref=) vers /api/ref, qui pose le cookie ;
 *  - barrer l'admin aux visiteurs sans cookie de session. Ce n'est qu'un premier
 *    filtre : le rôle admin est vérifié pour de bon dans requireAdmin(), côté serveur ;
 *  - couper court aux sondes de vulnérabilités, avant tout rendu.
 */

/*
 * Adresses que seul un scanner demande : WordPress, fichiers d'environnement, dépôts
 * git, exécutables PHP, fichiers de clés. Elles valaient jusqu'ici une 404 complète —
 * c'est-à-dire un rendu React entier, en-tête et pied de page compris, donc plusieurs
 * lectures Firestore pour des réglages que personne ne lira. Une réponse nue coûte
 * mille fois moins.
 *
 * Aucune page du site ne peut ressembler à ça : les adresses sont des slugs
 * (`notre-histoire`, `infos/cgv`), sans point en tête, sans extension, sans « wp ».
 *
 * À noter : cela n'allège PAS les journaux. Cloud Run inscrit la requête lui-même,
 * avant notre code — les 404 continueront d'y apparaître. Pour le bruit, c'est un
 * filtre d'exclusion Cloud Logging qu'il faut, pas du code.
 */
const SCANNER = new RegExp(
  [
    "(^|/)wp[-/]", // wp-admin, wp-includes, wp-content, wp/…
    "(^|/)wordpress(/|$)",
    "(^|/)\\.(env|git|aws|svn|vscode|config|docker)", // .env, .env.local, .git/config…
    "\\.(php|phtml|asp|aspx|jsp|cgi|sql|bak|old|ini|conf|yml|yaml)$",
    "(^|/)(xmlrpc|phpinfo|info|shell|eval|telescope)\\.",
    "(^|/)(credentials|key|keyfile|google-key|google-credentials|gcp-sa|firebase-key|firebase-adminsdk|service-account)\\.json$",
    "(^|/)_ignition(/|$)",
    "(^|/)vendor(/|$)",
  ].join("|"),
  "i",
);

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Sonde de vulnérabilité : 404 nue, sans rendu ni lecture en base.
  if (SCANNER.test(pathname)) return new NextResponse(null, { status: 404 });

  // Lien influenceur (?ref=slug) : le route handler pose le cookie et compte le clic.
  const ref = searchParams.get("ref");
  if (ref) {
    const clean = new URL(request.url);
    clean.searchParams.delete("ref");
    const target = new URL("/api/ref", request.url);
    target.searchParams.set("r", ref);
    target.searchParams.set("to", clean.pathname + clean.search);
    return NextResponse.redirect(target);
  }

  if (pathname.startsWith("/admin") && !request.cookies.has("__session")) {
    const login = new URL("/compte/connexion", request.url);
    login.searchParams.set("retour", pathname);
    return NextResponse.redirect(login);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  /*
   * Tout sauf les internes de Next, les routes d'API et les vrais fichiers servis
   * depuis `public/`. On ne peut plus écarter « tout ce qui contient un point » : les
   * sondes visent justement `.env` et `index.php`, et elles doivent nous parvenir pour
   * être coupées ici. D'où une liste d'extensions, celles que le site sert vraiment.
   */
  matcher: ["/((?!_next/|api/|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|txt|xml|webmanifest|woff2?|mp4|webm|pdf|css|js|map)$).*)"],
};
