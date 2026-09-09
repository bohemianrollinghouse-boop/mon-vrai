import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deletePushSubscription } from "@/lib/db/push";

/** Supprime l'abonnement push (désactivation des notifications sur cet appareil). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Endpoint manquant." }, { status: 400 });

  await deletePushSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
