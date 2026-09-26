import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/db/orders";
import { orderSlipPdf } from "@/lib/pdf/order-slip";

/*
 * Bon de livraison (PDF) d'une commande — administrateurs seulement. Il dit ce qu'il y a
 * dans le colis et pour qui : c'est le seul document d'un colis offert — kit de
 * partenaire ou lot de concours —, qui n'est jamais facturé. Rendu à la volée, jamais stocké (voir `lib/pdf/order-slip.ts`).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  const bytes = await orderSlipPdf(order);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="bon-${order.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
