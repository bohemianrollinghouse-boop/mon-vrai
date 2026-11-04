import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/fb-groups/api";
import { fbGroupsOpenApi } from "@/lib/fb-groups/openapi";

/*
 * La documentation de l'API, servie SANS clé : elle ne contient rien de secret, et
 * l'agent peut la lire en ouvrant simplement l'onglet — c'est depuis cet onglet qu'il
 * fera ensuite ses appels (même origine, donc pas de CORS).
 */
export function GET() {
  return NextResponse.json(fbGroupsOpenApi(`${siteUrl()}/api/fb-groups`), { headers: { "cache-control": "public, max-age=300" } });
}
