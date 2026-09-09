import { NextResponse } from "next/server";
import { getInfluencerBySlug, recordRefClick } from "@/lib/db/promos";
import { REF_COOKIE, REF_DAYS } from "@/lib/promos/resolve";
import { safeInternalPath } from "@/lib/domain/safe-path";

/*
 * Lien de suivi influenceur : monvrai.fr/…?ref=<slug>. Le proxy redirige ici ; on pose
 * le cookie d'attribution (30 jours), on compte le clic, et on renvoie le visiteur sur
 * la page demandée, sans le paramètre. Un slug inconnu redirige simplement.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("r") ?? "").toLowerCase();
  const safeTo = safeInternalPath(url.searchParams.get("to"), "/");
  // Base publique explicite : derrière Cloud Run, request.url porte l'origine interne
  // (0.0.0.0:8080), et une redirection absolue construite dessus sortait du site.
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const res = NextResponse.redirect(new URL(safeTo, base), 302);

  const influencer = slug ? await getInfluencerBySlug(slug).catch(() => null) : null;
  if (influencer && influencer.active && !(influencer.endAt && influencer.endAt < Date.now())) {
    res.cookies.set(REF_COOKIE, influencer.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: REF_DAYS * 86_400 });
    await recordRefClick(influencer.id).catch((err) => console.warn("[ref] clic non compté :", err));
  }
  return res;
}
