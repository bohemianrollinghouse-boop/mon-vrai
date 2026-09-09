import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";
import { buildBoxtalCsv } from "@/lib/boxtal/csv";

/*
 * Fichier d'import Boxtal (CSV) d'une commande — administrateurs seulement. Repli pour
 * l'expédition manuelle quand la création d'étiquette par l'API échoue : on télécharge ce
 * CSV et on l'importe dans Boxtal. Le suivi se saisit ensuite à la main dans l'admin.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  const settings = await getSettings();
  const csv = buildBoxtalCsv(order, settings);
  // Pas de BOM : Boxtal mappe les colonnes par leur en-tête exact ; un BOM collé au
  // premier en-tête (recipient_first_name) empêchait Boxtal de reconnaître cette colonne.
  // L'UTF-8 sans BOM passe très bien (les accents sont lus correctement à l'import).
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="boxtal-${order.number}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
