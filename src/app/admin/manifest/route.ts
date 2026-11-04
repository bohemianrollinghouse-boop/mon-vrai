import { NextResponse } from "next/server";
import icon192 from "@/assets/pwa/admin-192.png";
import icon512 from "@/assets/pwa/admin-512.png";

/*
 * Manifest de la PWA admin, scopé à /admin : l'admin est installable comme une appli
 * (plein écran), et la boutique publique ne l'est pas (aucun manifest lié côté site).
 *
 * Les icônes sont IMPORTÉES, et ne vivent donc pas dans `public/` : ce dossier n'arrive
 * pas en production — App Hosting déploie la sortie « standalone » de Next, qui n'emporte
 * que les fichiers tracés. C'est la raison pour laquelle le service worker est déjà servi
 * par une route ; les icônes, elles, étaient restées derrière et répondaient 404, si bien
 * que l'admin s'installait sans icône. Importées, elles partent dans `_next/static/`, et
 * leurs dimensions viennent du fichier au lieu d'être recopiées à côté.
 */
export function GET() {
  const manifest = {
    id: "/admin",
    name: "Mon Vrai Admin",
    short_name: "MV Admin",
    description: "Administration de la boutique Mon Vrai",
    scope: "/admin",
    start_url: "/admin",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fbf8f3",
    theme_color: "#111111",
    lang: "fr",
    icons: [
      { src: icon192.src, sizes: `${icon192.width}x${icon192.height}`, type: "image/png", purpose: "any" },
      { src: icon512.src, sizes: `${icon512.width}x${icon512.height}`, type: "image/png", purpose: "any" },
      { src: icon512.src, sizes: `${icon512.width}x${icon512.height}`, type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
