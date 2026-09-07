import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";
import { ensureCustomer } from "@/lib/db/customers";

/*
 * Échange du jeton Firebase Auth (obtenu dans le navigateur) contre un cookie de
 * session httpOnly. Le jeton est vérifié côté serveur avant tout : un jeton forgé ou
 * expiré est rejeté. C'est aussi ici qu'une fiche client est créée à la première
 * connexion.
 */

const Body = z.object({ idToken: z.string().min(20) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });

  try {
    const decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);
    if (decoded.email) await ensureCustomer(decoded.uid, decoded.email, (decoded.name as string | undefined) ?? "");
    await createSession(parsed.data.idToken);
    return NextResponse.json({ ok: true, admin: decoded.admin === true });
  } catch (err) {
    console.warn("[session] jeton refusé :", err);
    return NextResponse.json({ error: "Connexion refusée" }, { status: 401 });
  }
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
