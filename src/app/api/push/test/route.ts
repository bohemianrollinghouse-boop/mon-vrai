import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendTest } from "@/lib/push/send";

/** Envoie une notification de test à l'appareil qui la demande. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Endpoint manquant." }, { status: 400 });

  const res = await sendTest(body.endpoint);
  if (res.skipped) return NextResponse.json({ error: "Notifications non configurées (clés VAPID manquantes)." }, { status: 503 });
  if (!res.ok) return NextResponse.json({ error: "Échec de l'envoi." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
