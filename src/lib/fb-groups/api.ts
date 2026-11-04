import "server-only";
import { NextResponse } from "next/server";
import { apiKeyValid } from "@/lib/db/fb-groups";
import { fillMessage, trackingLink, type FbGroup, type FbGroupsConfig } from "@/lib/domain/fb-groups";

/*
 * Ce que partagent les routes de /api/fb-groups : le contrôle de la clé, la forme d'un
 * groupe telle que l'API la rend, et l'adresse publique du site.
 */

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
}

export function siteHost(): string {
  return new URL(siteUrl()).hostname;
}

/** Les en-têtes communs : jamais en cache (les réponses dépendent de la clé). */
export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** null si la clé est bonne, sinon la réponse 401 à renvoyer telle quelle. */
export async function denyWithoutKey(request: Request): Promise<NextResponse | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
  if (await apiKeyValid(token).catch(() => false)) return null;
  return json({ error: "Clé d'API manquante, invalide ou révoquée (en-tête Authorization: Bearer <clé>)." }, 401);
}

/** Un groupe tel que l'API le rend : son lien de suivi, et son message brut ({lien} compris). */
export function apiView(g: FbGroup, config: FbGroupsConfig) {
  return {
    slug: g.slug,
    name: g.name,
    groupUrl: g.groupUrl,
    status: g.status,
    membership: g.membership,
    members: g.members,
    hasMessage: !!g.message,
    message: g.message,
    link: trackingLink(siteUrl(), config.landingPath, g.slug),
    postUrl: g.postUrl,
    postStatus: g.postStatus,
    note: g.note,
    /** Dernier relevé du post par le script Tampermonkey (lecture seule). */
    scan: g.scan,
    unreadComments: Math.max(0, (g.scan?.comments ?? 0) - g.commentsSeen),
    createdAt: new Date(g.createdAt).toISOString(),
  };
}

/** Le message prêt à poster, lien de suivi en place. */
export function finalMessage(g: FbGroup, config: FbGroupsConfig): string | null {
  return g.message ? fillMessage(g.message, trackingLink(siteUrl(), config.landingPath, g.slug)) : null;
}

/** Lit un corps JSON, ou null. */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

/** Le segment `[group]` de l'adresse : un slug, ou un lien de groupe encodé. */
export function groupRef(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
