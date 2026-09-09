import "server-only";
import type { SiteSettings } from "@/lib/domain/types";
import type { BuiltEmail } from "./templates";
import { type Brand, type RenderCtx, templateById, toPlainText, wrapEmail } from "@/lib/newsletter/render";

/*
 * Rendu d'une newsletter « Mon Vrai » à partir d'un des huit modèles riches (voir
 * lib/newsletter/render.ts). Les textes et images édités dans l'admin arrivent dans
 * `values` (clés nues pour les textes, préfixe « img: » pour les images). Ici on ajoute
 * seulement ce qui vient des réglages (marque, logo, réseaux, adresse) et le lien de
 * désinscription propre à chaque destinataire.
 */

export function brandFromSettings(settings: SiteSettings, base: string): Brand {
  return {
    shopName: settings.shopName,
    logoUrl: `${base}/email-logo.png`,
    address: settings.contact.addressLines.filter(Boolean).join(", "),
    instagram: settings.socials.instagram,
    tiktok: settings.socials.tiktok,
    facebook: settings.socials.facebook,
  };
}

export function renderNewsletter(id: string, values: Record<string, string>, settings: SiteSettings, unsubscribeUrl: string): BuiltEmail {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const ctx: RenderCtx = { mode: "email", base, unsub: unsubscribeUrl, brand: brandFromSettings(settings, base), values };

  const subject = values.subject?.trim() || templateById(id)?.subject || `Des nouvelles de ${settings.shopName}`;
  const html = wrapEmail(id, ctx, subject);
  const text = toPlainText(html, unsubscribeUrl);
  return { subject, html, text };
}
