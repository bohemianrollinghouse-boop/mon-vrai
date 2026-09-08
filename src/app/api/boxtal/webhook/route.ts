import { NextResponse } from "next/server";
import { verifyBoxtalSignature } from "@/lib/boxtal/client";
import { syncBoxtal } from "@/lib/boxtal/shipment";
import { findOrderByBoxtalId } from "@/lib/db/orders";

/*
 * Webhook Boxtal : DOCUMENT_CREATED (l'étiquette est prête) et TRACKING_CHANGED (le
 * colis avance). On vérifie la signature HMAC, on retrouve la commande par la référence
 * Boxtal, puis on relit documents et suivi à la source plutôt que de faire confiance au
 * corps de la requête. Répondre vite : Boxtal attend un 2xx en moins de 2 secondes.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyBoxtalSignature(raw, request.headers.get("x-bxt-signature"))) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  let event: { type?: string; shippingOrderId?: string; shipmentExternalId?: string } = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const boxtalId = event.shippingOrderId;
  if (!boxtalId) return NextResponse.json({ received: true, ignored: "sans référence" });

  const order = await findOrderByBoxtalId(boxtalId);
  if (!order) return NextResponse.json({ received: true, ignored: "commande inconnue" });

  // La synchronisation peut prendre plus de 2 s (téléchargement de l'étiquette) : on
  // répond tout de suite et on laisse le travail se terminer.
  void syncBoxtal(order.id).catch((err) => console.warn("[boxtal] webhook synchro :", err));
  return NextResponse.json({ received: true, type: event.type });
}
