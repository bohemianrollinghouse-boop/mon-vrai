import { NextResponse, type NextRequest } from "next/server";

/*
 * Proxy (l'ex-middleware de Next). Deux rôles, volontairement minces :
 *  - transmettre le chemin courant aux composants serveur (`x-pathname`), pour marquer
 *    l'entrée de menu active sans composant client ;
 *  - rediriger les liens influenceurs (?ref=) vers /api/ref, qui pose le cookie ;
 *  - barrer l'admin aux visiteurs sans cookie de session. Ce n'est qu'un premier
 *    filtre : le rôle admin est vérifié pour de bon dans requireAdmin(), côté serveur.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

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
  // Tout sauf les fichiers statiques et les internes de Next.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
