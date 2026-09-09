import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { savePushSubscription } from "@/lib/db/push";

/*
 * Enregistre (ou met à jour) l'abonnement push du navigateur admin courant, avec les types
 * d'évènements souhaités. Réservé aux admins.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; events?: { newOrder?: boolean } } | null;
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });

  await savePushSubscription({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    uid: user.uid,
    email: user.email,
    events: { newOrder: body?.events?.newOrder !== false },
  });
  return NextResponse.json({ ok: true });
}
