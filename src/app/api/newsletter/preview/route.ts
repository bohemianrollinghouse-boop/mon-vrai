import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { renderNewsletter } from "@/lib/email/newsletter";
import { templateById } from "@/lib/newsletter/render";

/*
 * Aperçu du rendu e-mail FINAL d'un modèle (enveloppe complète), à partir des valeurs
 * éditées envoyées en JSON. L'édition, elle, se fait en ligne dans l'admin (aperçu
 * éditable) ; cette route sert à visualiser l'e-mail tel qu'il partira. Ne sauvegarde rien.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const form = await request.formData();
  const templateId = String(form.get("templateId") ?? "");
  if (!templateById(templateId)) return NextResponse.json({ error: "Modèle inconnu" }, { status: 400 });

  let values: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(form.get("values") ?? "{}")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") values[k] = v;
  } catch {
    values = {};
  }

  const settings = await getSettings();
  const html = renderNewsletter(templateId, values, settings, "#").html;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
