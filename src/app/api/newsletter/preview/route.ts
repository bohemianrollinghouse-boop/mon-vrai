import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { renderNewsletter } from "@/lib/email/newsletter";
import { templateById } from "@/lib/newsletter/templates";

/*
 * Aperçu de la newsletter (admin) : rend le modèle choisi à partir des champs du
 * formulaire, pour l'afficher en direct pendant l'édition. Ne sauvegarde rien ; le lien
 * de désinscription est neutralisé (#).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const form = await request.formData();
  const templateId = String(form.get("templateId") ?? "");
  const def = templateById(templateId);
  const values: Record<string, string> = {};
  for (const field of def?.fields ?? []) values[field.name] = String(form.get(field.name) ?? "");

  const settings = await getSettings();
  const html = renderNewsletter(templateId, values, settings, "#").html;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
