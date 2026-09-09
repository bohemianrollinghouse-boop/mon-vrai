import { NextResponse } from "next/server";

/*
 * Manifest de la PWA admin, scopé à /admin : l'admin est installable comme une appli
 * (plein écran), et la boutique publique ne l'est pas (aucun manifest lié côté site).
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
      { src: "/admin/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/admin/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/admin/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
