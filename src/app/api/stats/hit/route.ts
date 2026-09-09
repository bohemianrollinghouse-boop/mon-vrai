import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { heartbeat, recordHit, statsSalt } from "@/lib/db/stats";
import { bucketPath, clientIp, dayKey, deviceKind, hourKey, isBot, sourceKey, visitorHash } from "@/lib/stats/keys";

/*
 * Balise de fréquentation (voir components/site/StatsBeacon). Deux messages : « view »
 * (une page s'affiche) et « ping » (l'onglet est toujours ouvert). On ne compte ni les
 * robots, ni les administrateurs connectés, ni l'admin lui-même. Réponse 204 dans tous
 * les cas : le navigateur n'attend rien.
 */

const Body = z.object({
  t: z.enum(["view", "ping"]),
  p: z.string().max(300),
  r: z.string().max(500).default(""),
  u: z.string().max(60).default(""),
  s: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  f: z.boolean().default(false),
});

const ok = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  const ua = request.headers.get("user-agent");
  if (isBot(ua)) return ok();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return ok();
  const b = parsed.data;
  if (b.p.startsWith("/admin") || b.p.startsWith("/api")) return ok();

  // Un administrateur connecté qui parcourt sa boutique ne compte pas.
  const user = await getSessionUser().catch(() => null);
  if (user?.isAdmin) return ok();

  const path = bucketPath(b.p);
  const at = Date.now();
  try {
    if (b.t === "view") {
      const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").hostname;
      const day = dayKey(at);
      const entry = b.f ? { source: sourceKey(b.u, b.r, siteHost), device: deviceKind(ua) } : undefined;
      await recordHit({ day, hour: hourKey(at), path, visitor: visitorHash(statsSalt(), day, clientIp(request.headers.get("x-forwarded-for")), ua ?? ""), entry });
      await heartbeat({ sessionId: b.s, path, ...entry });
    } else {
      await heartbeat({ sessionId: b.s, path });
    }
  } catch (err) {
    console.warn("[stats] balise non enregistrée :", (err as Error).message);
  }
  return ok();
}
