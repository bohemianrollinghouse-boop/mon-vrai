import { NextResponse } from "next/server";
import { readLabel } from "@/lib/boxtal/shipment";
import { getSessionUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/db/orders";

/** Bordereau d'expédition (PDF) d'une commande — administrateurs seulement. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  const bytes = await readLabel(order);
  if (!bytes) return NextResponse.json({ error: "Étiquette pas encore disponible" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="etiquette-${order.number}.pdf"`, "cache-control": "private, no-store" },
  });
}
