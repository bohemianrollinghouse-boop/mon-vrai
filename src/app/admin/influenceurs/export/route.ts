import { NextResponse } from "next/server";
import { adminSnapshot } from "@/lib/admin/counts";
import { getSessionUser } from "@/lib/auth/session";
import { listInfluencers, listRefClicksSince } from "@/lib/db/promos";
import { mainAccount } from "@/lib/promos/socials";
import { influencerStats } from "@/lib/promos/stats";

/** Export CSV des influenceurs et de leurs résultats sur 30 jours (Excel : BOM + point-virgule). */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const [influencers, snap] = await Promise.all([listInfluencers(), adminSnapshot()]);
  const since = new Date(snap.now - 30 * 86_400_000).toISOString().slice(0, 10);
  const { rows } = influencerStats(influencers, snap.orders, await listRefClicksSince(since).catch(() => []), snap.now);
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const head = ["Nom", "Pseudo", "Plateforme", "Code", "Remise %", "Commission %", "Lien", "Statut", "Clics 30 j", "Ventes", "via code", "via lien", "CA attribué", "Commission due"];
  const lines = rows.map((r) => [r.influencer.name, mainAccount(r.influencer).handle, mainAccount(r.influencer).platform, r.influencer.code, r.influencer.discount, r.influencer.rate, `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr"}/?ref=${r.influencer.slug}`, r.influencer.active ? "Active" : "En pause", r.clicks, r.orders, r.byCode, r.byLink, euros(r.revenue), euros(r.commission)].map(cell).join(";"));
  const csv = "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="influenceurs-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" } });
}
