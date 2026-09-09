import "server-only";
import type { NewsletterContent, SiteSettings } from "@/lib/domain/types";
import { button, esc, eyebrow, h1, layout, type BuiltEmail } from "./templates";

/*
 * Gabarit fixe de la newsletter, aux couleurs de Mon Vrai (même mise en page que les
 * e-mails transactionnels). Seul le contenu change (sujet, titre, corps, bouton, image),
 * édité dans l'admin. Chaque envoi porte le lien de désinscription du destinataire.
 */

const MUTED = "#666666";

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${MUTED}">${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function newsletterEmail(content: NewsletterContent, settings: SiteSettings, unsubscribeUrl: string): BuiltEmail {
  const image = content.imageUrl ? `<img src="${esc(content.imageUrl)}" alt="" style="width:100%;height:auto;border-radius:16px;border:0;margin-bottom:20px">` : "";
  const cta = content.cta.label && content.cta.href ? button(content.cta.label, content.cta.href) : "";
  const html = layout(settings, {
    preheader: content.heading || content.subject,
    content: `${content.eyebrow ? eyebrow(content.eyebrow) : ""}${content.heading ? h1(content.heading) : ""}${image}${paragraphs(content.body)}${cta}
<p style="margin:24px 0 0;font-size:11px;line-height:1.6;color:#999">Vous recevez cet e-mail car vous êtes inscrit·e à la newsletter de ${esc(settings.shopName)}. <a href="${esc(unsubscribeUrl)}" style="color:#999;text-decoration:underline">Se désinscrire</a>.</p>`,
  });

  const text = [
    content.heading || content.subject,
    "",
    content.body,
    content.cta.label && content.cta.href ? `\n${content.cta.label} : ${content.cta.href}` : "",
    "",
    `Se désinscrire : ${unsubscribeUrl}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return { subject: content.subject || `Des nouvelles de ${settings.shopName}`, html, text };
}
