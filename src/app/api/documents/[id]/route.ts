import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDocumentFile } from "@/lib/db/documents";

/*
 * Téléchargement d'une pièce administrative (norme CE, rapport de laboratoire,
 * attribution d'ISBN, contrat…). Ces fichiers vivent dans un dossier privé du bucket :
 * ils ne sont servis qu'ici, et seulement à un administrateur. Aucune mise en cache —
 * ce sont des documents de la société, pas des images de la boutique.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await ctx.params;
  const result = await readDocumentFile(id);
  if (!result) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  // Le PDF et les images s'ouvrent dans l'onglet ; le reste se télécharge.
  const inline = result.doc.mime === "application/pdf" || result.doc.mime.startsWith("image/");
  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "content-type": result.doc.mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${result.doc.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
