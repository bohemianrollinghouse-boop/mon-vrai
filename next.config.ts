import type { NextConfig } from "next";
import legacyRedirects from "./content/redirects.json";

const nextConfig: NextConfig = {
  /*
   * Redirections permanentes depuis les URLs de l'ancienne boutique Shopify : produits,
   * politiques, collections, panier, compte. Générées depuis l'export dans
   * content/redirects.json — le référencement acquis suit vers les nouvelles adresses.
   */
  async redirects() {
    return legacyRedirects.map((r) => ({ ...r, permanent: true }));
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
