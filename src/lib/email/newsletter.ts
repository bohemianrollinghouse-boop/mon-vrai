import "server-only";
import type { SiteSettings } from "@/lib/domain/types";
import { templateById, templateDefaults } from "@/lib/newsletter/templates";
import { button, esc, eyebrow as eyebrowBlock, h1, layout, type BuiltEmail } from "./templates";

/*
 * Rendu riche d'une newsletter, aux couleurs de Mon Vrai. Chaque modèle partage la même
 * ossature soignée (bannière image, surtitre, titre, produit sur cadre coloré, encadré
 * mis en avant, bouton, signature) mais avec son propre contenu, éditable dans l'admin.
 * HTML compatible e-mail : tableaux, styles en ligne, une seule colonne.
 */

const MUTED = "#666666";
const GREEN = "#dce5d6";
const GREEN_INK = "#3a4438";

function paras(body: string, color = MUTED): string {
  return body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${color}">${esc(b).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function heroImage(url: string): string {
  return url ? `<img src="${esc(url)}" alt="" style="display:block;width:100%;height:auto;border-radius:16px;border:0;margin:0 0 22px">` : "";
}

function productOnTint(url: string): string {
  if (!url) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 20px">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-radius:20px;background:${GREEN}"><tr><td align="center" style="padding:26px 40px">
<img src="${esc(url)}" alt="" style="display:block;width:220px;max-width:60vw;height:auto;border-radius:10px;border:0">
</td></tr></table></td></tr></table>`;
}

function tintPanel(title: string, text: string): string {
  if (!title && !text) return "";
  const head = title ? `<div style="font-size:14px;font-weight:800;color:${GREEN_INK};margin-bottom:${text ? "4px" : "0"}">${esc(title)}</div>` : "";
  const bodyHtml = text ? `<div style="font-size:13px;line-height:1.6;color:${GREEN_INK}">${esc(text).replace(/\n/g, "<br>")}</div>` : "";
  return `<div style="background:${GREEN};border-radius:16px;padding:18px 20px;margin:0 0 20px">${head}${bodyHtml}</div>`;
}

export function renderNewsletter(id: string, values: Record<string, string>, settings: SiteSettings, unsubscribeUrl: string): BuiltEmail {
  const def = templateById(id);
  const v = { ...templateDefaults(id || "lancement"), ...values };
  const get = (k: string) => (v[k] ?? "").trim();

  const content = `${heroImage(get("heroImage"))}${get("eyebrow") ? eyebrowBlock(get("eyebrow")) : ""}${get("title") ? h1(get("title")) : ""}${productOnTint(get("productImage"))}${paras(get("intro"))}${tintPanel(get("highlightTitle"), get("highlight"))}${get("ctaLabel") && get("ctaHref") ? button(get("ctaLabel"), get("ctaHref")) : ""}${get("signature") ? paras(get("signature"), "#111111") : ""}
<p style="margin:26px 0 0;font-size:11px;line-height:1.6;color:#999">Vous recevez cet e-mail car vous êtes inscrit·e à la newsletter de ${esc(settings.shopName)}. <a href="${esc(unsubscribeUrl)}" style="color:#999;text-decoration:underline">Se désinscrire</a>.</p>`;

  const html = layout(settings, { preheader: get("title") || get("subject") || def?.label || "", content });

  const text = [get("title"), "", get("intro"), get("highlight") ? `\n${get("highlight")}` : "", get("ctaLabel") && get("ctaHref") ? `\n${get("ctaLabel")} : ${get("ctaHref")}` : "", get("signature") ? `\n${get("signature")}` : "", "", `Se désinscrire : ${unsubscribeUrl}`]
    .filter((l) => l !== undefined)
    .join("\n");

  return { subject: get("subject") || `Des nouvelles de ${settings.shopName}`, html, text };
}
