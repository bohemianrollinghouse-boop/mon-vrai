import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { contractGuide, partnerMayReadGuide } from "@/lib/db/contract-guide";
import { readDocumentFile } from "@/lib/db/documents";

/*
 * L'annexe d'un contrat — le kit de création de contenu que le créateur emporte en
 * signant.
 *
 * C'est la seule pièce de la bibliothèque qui sorte de l'administration, et le droit de
 * la lire se relit donc en base : administrateur, ou partenaire à qui ce contrat est
 * proposé ou qu'il a signé. L'identifiant dans l'adresse ne prouve rien par lui-même.
 *
 * Servie en Buffer et non en flux : un PDF de conseils pèse quelques mégaoctets, là où
 * une vidéo de partenaire en pèse cent (voir /api/contenus/[id]).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await ctx.params;
  const allowed = user.isAdmin || (user.influencerId ? await partnerMayReadGuide(user.influencerId, id) : false);
  if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const doc = await contractGuide(id);
  if (!doc) return NextResponse.json({ error: "Aucune annexe sur ce contrat" }, { status: 404 });

  const file = await readDocumentFile(doc.id);
  if (!file) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  /* Un PDF s'ouvre dans l'onglet, le reste se télécharge — comme pour les documents. */
  const inline = file.doc.mime === "application/pdf" || file.doc.mime.startsWith("image/");
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.doc.mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${file.doc.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
