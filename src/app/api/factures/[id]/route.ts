import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/db/orders";
import { readInvoicePdf } from "@/lib/invoice/issue";

/*
 * Téléchargement d'une facture. Le fichier n'est jamais public : on vérifie que le
 * visiteur est l'acheteur (compte rattaché à la commande) ou un administrateur avant
 * de le lire depuis le bucket. Une commande payée mais pas encore facturée l'est ici,
 * à la volée — le numéro est le même que celui que le webhook aurait attribué.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });

  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  if (!user.isAdmin && order.customerUid !== user.uid) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (order.status === "pending_payment" || order.status === "cancelled") {
    return NextResponse.json({ error: "Pas de facture pour cette commande" }, { status: 404 });
  }

  const result = await readInvoicePdf(id);
  if (!result) return NextResponse.json({ error: "Facture indisponible" }, { status: 404 });

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${result.order.invoice?.number ?? "facture"}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
