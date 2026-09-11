import "server-only";
import { formatEuro } from "@/lib/domain/money";
import type { Order, SiteSettings } from "@/lib/domain/types";

/*
 * Templates d'e-mails, aux couleurs de Mon Vrai. Contrainte des clients d'e-mail :
 * pas de feuille de style externe ni de police web fiable, un rendu correct dans
 * Outlook — d'où des tableaux, des styles en ligne et une pile de polices système.
 * Chaque template rend { subject, html, text } ; le texte est le repli sans images.
 */

const INK = "#111111";
const PAPER = "#fbf8f3";
const MUTED = "#666666";
const SUBTLE = "#888888";
const LINE = "#eeeeee";
const GREEN = "#dce5d6";
const GREEN_INK = "#3a4438";
const SAND = "#f3e9dc";
const SAND_INK = "#5a4a38";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export type BuiltEmail = { subject: string; html: string; text: string };

/** Logo servi par notre propre domaine : les clients d'e-mail refusent souvent les URLs de stockage. */
function logoUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  return `${base}/email-logo.png`;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Bouton pilule noir, table-based pour Outlook. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td style="border-radius:999px;background:${INK}"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}

/** Encadre le contenu : bandeau, en-tête logo, carte blanche, pied de page. */
export function layout(settings: SiteSettings, opts: { preheader: string; banner?: string; content: string }): string {
  const socials = [
    settings.socials.instagram && `<a href="${esc(settings.socials.instagram)}" style="color:${SUBTLE};text-decoration:none">Instagram</a>`,
    settings.socials.tiktok && `<a href="${esc(settings.socials.tiktok)}" style="color:${SUBTLE};text-decoration:none">TikTok</a>`,
    settings.socials.facebook && `<a href="${esc(settings.socials.facebook)}" style="color:${SUBTLE};text-decoration:none">Facebook</a>`,
  ]
    .filter(Boolean)
    .join(' <span style="color:#ccc">·</span> ');
  const contact = settings.contact.email ? `<a href="mailto:${esc(settings.contact.email)}" style="color:${SUBTLE};text-decoration:none">${esc(settings.contact.email)}</a>` : "";
  const address = settings.contact.addressLines.filter(Boolean).join(", ");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(settings.shopName)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%">
${opts.banner ? `<tr><td style="background:${INK};color:#fff;border-radius:16px;padding:12px 20px;font-size:12px;font-weight:600;text-align:center;letter-spacing:.02em">${esc(opts.banner)}</td></tr><tr><td style="height:16px"></td></tr>` : ""}
<tr><td align="center" style="padding:8px 0 20px"><img src="${logoUrl()}" alt="${esc(settings.shopName)}" width="132" style="width:132px;height:auto;border:0"></td></tr>
<tr><td style="background:#ffffff;border-radius:24px;padding:32px">${opts.content}</td></tr>
<tr><td style="padding:24px 8px 8px;text-align:center;font-size:12px;line-height:1.7;color:${SUBTLE}">
${contact ? `${contact}<br>` : ""}${socials ? `${socials}<br>` : ""}${address ? `${esc(address)}<br>` : ""}
<span style="color:#bbb">© ${new Date().getFullYear()} ${esc(settings.shopName)}${settings.legal.footerLine ? " · " + esc(settings.legal.footerLine) : ""}</span>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function itemsTable(order: Order): string {
  const rows = order.lines
    .map(
      (l) => `<tr>
<td style="padding:10px 0;border-top:1px solid ${LINE};font-size:14px;font-weight:600">${esc(l.title)}${l.gift ? ` <span style="color:${GREEN_INK};font-weight:700">· offert</span>` : ""}<br><span style="font-size:12px;color:${SUBTLE};font-weight:500">Quantité ${l.qty}${l.preorder && !l.gift ? " · précommande" : ""}</span></td>
<td style="padding:10px 0;border-top:1px solid ${LINE};font-size:14px;font-weight:700;text-align:right;white-space:nowrap">${l.gift ? "Offert" : formatEuro(l.unitPrice * l.qty)}</td>
</tr>`,
    )
    .join("");
  const totalRow = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:${strong ? "10px 0 0" : "4px 0"};font-size:${strong ? "16px" : "13px"};font-weight:${strong ? "800" : "600"};color:${strong ? INK : MUTED}">${esc(label)}</td><td style="padding:${strong ? "10px 0 0" : "4px 0"};font-size:${strong ? "16px" : "13px"};font-weight:${strong ? "800" : "600"};text-align:right;white-space:nowrap;${strong ? `border-top:1px solid ${LINE}` : ""}">${esc(value)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
<tr><td colspan="2" style="height:8px"></td></tr>
${totalRow("Sous-total", formatEuro(order.totals.subtotal))}
${order.totals.discount ? totalRow("Remise", `−${formatEuro(order.totals.discount)}`) : ""}
${totalRow("Livraison", order.totals.shipping === 0 ? "Offerte" : formatEuro(order.totals.shipping))}
${totalRow("Total", formatEuro(order.totals.total), true)}
</table>`;
}

function addressBlock(order: Order): string {
  const a = order.shippingAddress;
  const relay = order.delivery?.relay;
  const lines = relay
    ? [`<strong>Point relais ${esc(relay.name)}</strong>`, esc([relay.street, `${relay.postalCode} ${relay.city}`].filter(Boolean).join(", ")), `Au nom de ${esc(a.name)}`]
    : [`<strong>${esc(a.name)}</strong>`, esc(a.line1), a.line2 ? esc(a.line2) : "", esc(`${a.postalCode} ${a.city}`)];
  return lines.filter(Boolean).join("<br>");
}

export function h1(text: string): string {
  return `<h1 style="margin:0 0 6px;font-size:24px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:${INK}">${esc(text)}</h1>`;
}
export function eyebrow(text: string, ink = GREEN_INK): string {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${ink};margin-bottom:10px">${esc(text)}</div>`;
}
function panel(bg: string, ink: string, html: string): string {
  return `<div style="background:${bg};color:${ink};border-radius:16px;padding:18px 20px;font-size:13px;line-height:1.6;margin-top:20px">${html}</div>`;
}

export function orderConfirmationEmail(order: Order, settings: SiteSettings, siteUrl: string): BuiltEmail {
  const preorder = order.lines.some((l) => l.preorder && !l.gift);
  const shipFrom = settings.shipping.preorderShipFrom ? new Date(settings.shipping.preorderShipFrom).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const content = `${eyebrow("Commande confirmée")}${h1(`Merci ${esc(order.shippingAddress.name || "")} !`)}
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${MUTED}">Votre commande <strong style="color:${INK}">${esc(order.number)}</strong> est bien enregistrée${order.invoice ? ` et votre facture ${esc(order.invoice.number)} est en pièce jointe` : ""}.</p>
${itemsTable(order)}
<div style="margin-top:22px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${SUBTLE}">Livraison</div>
<p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:${INK}">${addressBlock(order)}</p>
${button("Suivre ma commande", `${siteUrl}/compte`)}
${
    preorder
      ? panel(GREEN, GREEN_INK, `<strong style="color:${INK}">Précommande</strong><br>${shipFrom ? `Expédition à partir du ${esc(shipFrom)}, tous vos livres dans un seul colis.` : "Nous vous préviendrons dès l'expédition."} 14 jours pour changer d'avis après réception.`)
      : panel(GREEN, GREEN_INK, "Nous préparons votre colis et vous préviendrons dès l'expédition. 14 jours pour changer d'avis après réception.")
  }`;
  const text = [
    `Merci pour votre commande ${order.number} !`,
    "",
    ...order.lines.map((l) => `• ${l.title} × ${l.qty} - ${l.gift ? "offert" : formatEuro(l.unitPrice * l.qty)}`),
    "",
    `Sous-total : ${formatEuro(order.totals.subtotal)}`,
    order.totals.discount ? `Remise : −${formatEuro(order.totals.discount)}` : "",
    `Livraison : ${order.totals.shipping === 0 ? "offerte" : formatEuro(order.totals.shipping)}`,
    `Total : ${formatEuro(order.totals.total)}`,
    "",
    `Livraison à : ${order.delivery?.relay ? `Point relais ${order.delivery.relay.name}, ${order.delivery.relay.postalCode} ${order.delivery.relay.city}` : `${order.shippingAddress.name}, ${order.shippingAddress.line1}, ${order.shippingAddress.postalCode} ${order.shippingAddress.city}`}`,
    "",
    preorder ? `Précommande : expédition ${shipFrom ? `à partir du ${shipFrom}` : "annoncée par e-mail"}.` : "Nous vous préviendrons dès l'expédition.",
    order.invoice ? `Facture ${order.invoice.number} jointe.` : "",
    `Suivre ma commande : ${siteUrl}/compte`,
    "",
    "Grandir avec du vrai.",
    settings.shopName,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { subject: `Votre commande ${order.number} - ${settings.shopName}`, html: layout(settings, { preheader: `Commande ${order.number} confirmée · ${formatEuro(order.totals.total)}`, banner: preorder && shipFrom ? `Précommande · expédition dès le ${shipFrom}` : undefined, content }), text };
}

export function shippingNoticeEmail(order: Order, settings: SiteSettings, siteUrl: string): BuiltEmail {
  const t = order.tracking;
  const relay = order.delivery?.relay;
  const content = `${eyebrow("En route", SAND_INK)}${h1("Votre commande est expédiée")}
<p style="margin:0 0 4px;font-size:15px;line-height:1.55;color:${MUTED}">La commande <strong style="color:${INK}">${esc(order.number)}</strong> vient de partir${t ? ` avec ${esc(t.carrier)}` : ""}.</p>
${
    t
      ? `<div style="background:${PAPER};border-radius:16px;padding:18px 20px;margin-top:18px">
<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${SUBTLE}">Numéro de suivi</div>
<div style="font-size:18px;font-weight:800;margin-top:4px">${esc(t.number)}</div>
<div style="font-size:13px;color:${MUTED};margin-top:2px">${esc(t.carrier)}</div>
</div>${t.url ? button("Suivre mon colis", t.url) : ""}`
      : ""
  }
${relay ? panel(SAND, SAND_INK, `<strong style="color:${INK}">Point relais</strong><br>${esc(relay.name)} · ${esc([relay.street, `${relay.postalCode} ${relay.city}`].filter(Boolean).join(", "))}<br>Votre colis y sera conservé 14 jours.`) : ""}
<p style="margin:20px 0 0;font-size:13px;color:${SUBTLE}">Une question ? Répondez à cet e-mail${settings.contact.email ? ` ou écrivez-nous à ${esc(settings.contact.email)}` : ""}.</p>`;
  const text = [
    `Bonne nouvelle : votre commande ${order.number} est en route.`,
    t ? `Transporteur : ${t.carrier} · n° ${t.number}` : "",
    t?.url ? `Suivi : ${t.url}` : "",
    relay ? `Point relais : ${relay.name}, ${relay.postalCode} ${relay.city} (conservé 14 jours).` : "",
    `Suivre ma commande : ${siteUrl}/compte`,
    "",
    settings.shopName,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { subject: `Votre commande ${order.number} est expédiée`, html: layout(settings, { preheader: t ? `Suivi ${t.carrier} ${t.number}` : "Votre colis est parti", content }), text };
}

/** Message de contact transmis à la boutique (interne). */
export function contactForwardEmail(m: { name: string; email: string; phone: string; subject: string; body: string }, settings: SiteSettings): BuiltEmail {
  const row = (k: string, v: string) => (v ? `<tr><td style="padding:4px 0;font-size:12px;font-weight:700;color:${SUBTLE};width:90px">${esc(k)}</td><td style="padding:4px 0;font-size:14px;font-weight:600">${esc(v)}</td></tr>` : "");
  const content = `${eyebrow("Nouveau message")}${h1(m.subject || "Formulaire de contact")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">${row("Nom", m.name)}${row("E-mail", m.email)}${row("Téléphone", m.phone)}</table>
<div style="background:${PAPER};border-radius:16px;padding:18px 20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(m.body)}</div>
${button("Répondre", `mailto:${esc(m.email)}?subject=${encodeURIComponent(`Re : ${m.subject || "votre message"} - ${settings.shopName}`)}`)}`;
  return { subject: `[Contact] ${m.subject || "Message"} - ${m.name || m.email}`, html: layout(settings, { preheader: m.body.slice(0, 100), content }), text: `${m.name}\n${m.email}\n${m.phone}\n\n${m.body}` };
}
