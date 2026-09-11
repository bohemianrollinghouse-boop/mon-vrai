import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import legacyRedirects from "./content/redirects.json";

/*
 * Horodatage et commit du build, figés au moment de `next build` (donc à chaque déploiement).
 * Affichés dans l'admin comme « dernière mise à jour » — automatique, rien à saisir à la main.
 * Le SHA vient de git s'il est disponible dans l'environnement de build, sinon on l'ignore.
 */
const BUILD_TIME = new Date().toISOString();
let BUILD_COMMIT = "";
try {
  BUILD_COMMIT = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  BUILD_COMMIT = "";
}

/*
 * En-têtes de sécurité, sur toutes les réponses. Pas de CSP complète (les scripts inline
 * de Next, Stripe.js, la carte Boxtal et la fenêtre Google exigeraient des nonces) : on
 * pose ce qui ne casse rien et protège vraiment. `frame-ancestors 'self'` interdit
 * d'encadrer le site (clickjacking de l'admin) tout en laissant l'aperçu e-mail de l'admin,
 * qui est une iframe de même origine. La géolocalisation reste possible pour la carte des
 * points relais. HSTS : App Hosting sert déjà tout en HTTPS.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // Inlinés au build : lus via process.env dans l'admin (voir components/admin, layout).
  env: { BUILD_TIME, BUILD_COMMIT },
  /*
   * Les envois de fichiers de l'admin (photos produit, médiathèque) passent par des
   * actions serveur, dont le corps est plafonné à 1 Mo par défaut — moins qu'une photo
   * de téléphone. La requête échouait alors avant d'entrer dans l'action, donnant une
   * erreur serveur nue. On aligne le plafond sur la taille annoncée par la médiathèque
   * (40 Mo), marge comprise. Ce corps est tamponné en mémoire : c'est la contrepartie,
   * acceptable pour un chemin réservé à l'administration.
   */
  experimental: { serverActions: { bodySizeLimit: "45mb" } },
  /*
   * Les photos des pages rédigées sont lues sur le disque par l'action « Reprendre le
   * contenu rédigé » (voir actions/pages.ts), et non importées : le traçage de Next ne
   * les emporterait donc pas dans le paquet déployé. On les déclare ici. Sans elles,
   * l'action se contente de signaler les photos manquantes — rien ne casse.
   */
  outputFileTracingIncludes: { "/admin/pages/[slug]": ["./content/editorial/**"] },
  // Ne pas annoncer la pile technique.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  /*
   * Redirections permanentes. D'abord les URLs de l'ancienne boutique Shopify
   * (content/redirects.json, généré depuis l'export) ; ensuite les adresses de ce
   * site qui ont bougé quand les pages légales et « Notre histoire » sont devenues
   * des pages libres. Le référencement acquis suit dans les deux cas.
   */
  async redirects() {
    return [
      ...legacyRedirects.map((r) => ({ ...r, permanent: true })),
      { source: "/informations", destination: "/privacy-policy", permanent: true },
      { source: "/informations/:handle", destination: "/:handle", permanent: true },
      // Les pages libres ont quitté /pages/ pour la racine ; l'ancien préfixe suit.
      { source: "/pages/:slug*", destination: "/:slug*", permanent: true },
    ];
  },
  images: {
    // Next refuse par défaut les images servies depuis une IP privée (anti-SSRF). En
    // développement, l'émulateur Storage tourne justement sur 127.0.0.1 : on l'autorise
    // là, et nulle part ailleurs — en production l'hôte est firebasestorage.googleapis.com.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    // Émulateur Storage en local, Firebase Storage en production, et le CDN Shopify le
    // temps de la migration (affiche de la vidéo d'accueil, pas encore rapatriée).
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "9199" },
      { protocol: "http", hostname: "localhost", port: "9199" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "mon-vrai-2.myshopify.com" },
    ],
  },
};

export default nextConfig;
