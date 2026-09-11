import "server-only";
import type { SiteSettings } from "@/lib/domain/types";
import type { BuiltEmail } from "./templates";
import { PARTNER_WELCOME_ID, type Brand, type RenderCtx, templateById, toPlainText, wrapEmail } from "@/lib/newsletter/render";

/*
 * Rendu d'une newsletter « Mon Vrai » à partir d'un des huit modèles riches (voir
 * lib/newsletter/render.ts). Les textes et images édités dans l'admin arrivent dans
 * `values` (clés nues pour les textes, préfixe « img: » pour les images). Ici on ajoute
 * seulement ce qui vient des réglages (marque, logo, réseaux, adresse) et le lien de
 * désinscription propre à chaque destinataire.
 */

export function brandFromSettings(settings: SiteSettings, base: string): Brand {
  // Adresse de contact des réglages ; à défaut, l'adresse légale du vendeur (celle des factures).
  const address = (settings.contact.addressLines.some(Boolean) ? settings.contact.addressLines : settings.legal.sellerAddressLines).filter(Boolean).join(", ");
  return {
    shopName: settings.shopName,
    logoUrl: `${base}/email-logo.png`,
    address,
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

/*
 * Invitation d'un partenaire. Mêmes textes pour tous (édités dans l'onglet
 * Influenceurs), mais un lien personnel par destinataire : il est injecté ici plutôt
 * que stocké, pour qu'aucun enregistrement du gabarit ne puisse le figer.
 */
export function renderPartnerWelcome(values: Record<string, string>, settings: SiteSettings, activationUrl: string): BuiltEmail {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const ctx: RenderCtx = {
    mode: "email",
    base,
    unsub: "",
    brand: brandFromSettings(settings, base),
    values: { ...values, __activation: activationUrl },
  };
  const subject = values.subject?.trim() || `Votre espace partenaire ${settings.shopName}`;
  const html = wrapEmail(PARTNER_WELCOME_ID, ctx, values.intro?.slice(0, 120) || "Votre espace partenaire est prêt.");
  return { subject, html, text: toPlainText(html, "") };
}
