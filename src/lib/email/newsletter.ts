import "server-only";
import type { SiteSettings } from "@/lib/domain/types";
import type { BuiltEmail } from "./templates";
import { resolveCrops, type CropMap } from "@/lib/newsletter/crops";
import { PARTNER_WELCOME_ID, collectCrops, cropKey, renderTemplateBody, type Brand, type CropReq, type RenderCtx, templateById, toPlainText, wrapEmail } from "@/lib/newsletter/render";

/*
 * Rendu d'une newsletter « Mon Vrai » à partir d'un des huit modèles riches (voir
 * lib/newsletter/render.ts). Les textes et images édités dans l'admin arrivent dans
 * `values` (clés nues pour les textes, préfixe « img: » pour les images). Ici on ajoute
 * seulement ce qui vient des réglages (marque, logo, réseaux, adresse) et le lien de
 * désinscription propre à chaque destinataire.
 *
 * L'envoi se fait en DEUX passes. Aucun client de messagerie ne sait recadrer une image
 * (`object-fit` est retiré par Gmail comme par Outlook) : les photos doivent donc arriver
 * déjà taillées. On rend une première fois pour recenser les images et la boîte que
 * chacune doit remplir (`prepareCrops`), on fabrique les dérivées, puis on rend pour de
 * bon en les substituant. Les dérivées étant nommées d'après leur demande, un second
 * envoi du même modèle réutilise les fichiers déjà déposés.
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

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
}

/** Substitue à chaque image sa version recadrée ; celles qu'on n'a pas su tailler repartent telles quelles. */
const substitute = (crops: CropMap) => (r: CropReq) => crops[cropKey(r)] ?? r.url;

/**
 * Première passe : recense les images d'un modèle et fabrique les dérivées. À faire UNE
 * fois par envoi, pas une fois par destinataire — le contenu est le même pour tout le
 * monde, seul le lien de désinscription change.
 */
export async function prepareCrops(id: string, values: Record<string, string>, settings: SiteSettings): Promise<CropMap> {
  const base = siteBase();
  return resolveCrops(collectCrops(id, { mode: "email", base, unsub: "", brand: brandFromSettings(settings, base), values }));
}

export function renderNewsletter(id: string, values: Record<string, string>, settings: SiteSettings, unsubscribeUrl: string, crops: CropMap = {}): BuiltEmail {
  const base = siteBase();
  const ctx: RenderCtx = { mode: "email", base, unsub: unsubscribeUrl, brand: brandFromSettings(settings, base), values, img: substitute(crops) };

  const subject = values.subject?.trim() || templateById(id)?.subject || `Des nouvelles de ${settings.shopName}`;
  const html = wrapEmail(id, ctx, subject);
  const text = toPlainText(html, unsubscribeUrl);
  return { subject, html, text };
}

/**
 * Corps seul d'une newsletter (sans l'enveloppe HTML), recadrages compris : c'est la
 * version web, celle que vise « Voir dans le navigateur ». Elle passe par les mêmes
 * dérivées que l'e-mail — une seule vérité de cadrage, pas deux.
 */
export async function renderNewsletterBody(id: string, values: Record<string, string>, settings: SiteSettings, unsubscribeUrl: string): Promise<string> {
  const base = siteBase();
  const crops = await prepareCrops(id, values, settings);
  return renderTemplateBody(id, { mode: "email", base, unsub: unsubscribeUrl, brand: brandFromSettings(settings, base), values, img: substitute(crops) });
}

/*
 * Invitation d'un partenaire. Mêmes textes pour tous (édités dans l'onglet
 * Influenceurs), mais un lien personnel par destinataire : il est injecté ici plutôt
 * que stocké, pour qu'aucun enregistrement du gabarit ne puisse le figer.
 */
export function renderPartnerWelcome(values: Record<string, string>, settings: SiteSettings, activationUrl: string, crops: CropMap = {}): BuiltEmail {
  const base = siteBase();
  const ctx: RenderCtx = {
    mode: "email",
    base,
    unsub: "",
    brand: brandFromSettings(settings, base),
    values: { ...values, __activation: activationUrl },
    img: substitute(crops),
  };
  const subject = values.subject?.trim() || `Votre espace partenaire ${settings.shopName}`;
  const html = wrapEmail(PARTNER_WELCOME_ID, ctx, values.intro?.slice(0, 120) || "Votre espace partenaire est prêt.");
  return { subject, html, text: toPlainText(html, "") };
}
