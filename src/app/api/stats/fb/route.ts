import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { recordFbClick } from "@/lib/db/fb-groups";
import { excludedIps, statsSalt } from "@/lib/db/stats";
import { describeUa, isRobot, refererFamily } from "@/lib/domain/fb-groups";
import { bucketPath, clientIp, dayKey, isBot, isExcludedIp, pickUserAgent, visitorHash } from "@/lib/stats/keys";

/*
 * Un clic sur le lien de suivi d'un groupe Facebook (`?fb=<slug>`), envoyé par la
 * balise de fréquentation (components/site/StatsBeacon) — donc par du JavaScript
 * exécuté dans le navigateur. C'est ce qui écarte le robot d'aperçu de Facebook, qui
 * lit la page dès qu'on poste le lien mais n'exécute rien.
 *
 * Mêmes exclusions que la fréquentation : un administrateur connecté (qui vérifie son
 * propre lien) et les adresses IP exclues ne laissent aucune trace. Un navigateur qui
 * se déclare robot est gardé, marqué, et n'entre dans aucun chiffre. Réponse 204 dans
 * tous les cas : la balise n'attend rien.
 */

const Body = z.object({
  g: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(70),
  p: z.string().max(300).default("/"),
  r: z.string().max(500).default(""),
  ua: z.string().max(400).default(""),
  v: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).optional(),
});

const ok = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return ok();
  const b = parsed.data;

  const user = await getSessionUser().catch(() => null);
  if (user?.isAdmin) return ok();
  if (isExcludedIp(clientIp(request.headers), await excludedIps().catch(() => []))) return ok();

  const ua = pickUserAgent(request.headers.get("user-agent"), b.ua);
  const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").hostname;
  const at = Date.now();
  try {
    await recordFbClick({
      group: b.g,
      robot: isRobot(ua) || isBot(ua),
      // Empreinte du jour, propre au groupe : elle ne sert qu'à reconnaître un doublon.
      visitor: b.v ? visitorHash(statsSalt(), dayKey(at), `fb|${b.g}|${b.v}`) : null,
      refererHost: refererFamily(b.r, siteHost),
      referer: b.r.trim().slice(0, 300) || null,
      path: bucketPath(b.p),
      ...describeUa(ua),
    });
  } catch (err) {
    console.warn("[fb] clic non enregistré :", (err as Error).message);
  }
  return ok();
}
