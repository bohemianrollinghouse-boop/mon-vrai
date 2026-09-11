import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deployStatus } from "@/lib/admin/deploy";

export const dynamic = "force-dynamic";

/*
 * État du déploiement, sondé par le bandeau de l'admin. Administrateurs seulement : ce
 * que fait l'infrastructure ne regarde pas les visiteurs.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const status = await deployStatus();
  return NextResponse.json(status ?? { active: false, unknown: true }, { headers: { "cache-control": "private, no-store" } });
}
