import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import type { NewsletterContent } from "@/lib/domain/types";
import { newsletterEmail } from "@/lib/email/newsletter";

/*
 * Aperçu de la newsletter (admin) : rend le vrai gabarit à partir des champs du
 * formulaire, pour l'afficher en direct dans un iframe pendant l'édition. Ne sauvegarde
 * rien. Le lien de désinscription est neutralisé (#) dans l'aperçu.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const form = await request.formData();
  const s = (k: string) => String(form.get(k) ?? "");
  const content: NewsletterContent = {
    subject: s("subject"),
    eyebrow: s("eyebrow"),
    heading: s("heading"),
    body: s("body"),
    cta: { label: s("cta.label"), href: s("cta.href") },
    imageUrl: s("imageUrl"),
    updatedAt: 0,
  };
  const settings = await getSettings();
  const html = newsletterEmail(content, settings, "#").html;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
