import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatEuro } from "@/lib/domain/money";
import type { Address, Order, SiteSettings } from "@/lib/domain/types";

/*
 * Rendu PDF de la facture (maquette « Mon Vrai - Facture »). Le numéro, les dates et les
 * totaux viennent de Tiime (via Make) ; le détail des lignes, les adresses et la livraison
 * viennent de la commande. La facture s'adapte à la configuration : en franchise de TVA
 * (pas de numéro de TVA), on affiche « TVA non applicable, art. 293 B du CGI » et pas de
 * colonne de taxe. Polices standard (WinAnsi) : les caractères hors Latin-1 sont nettoyés.
 */

const A4 = { width: 595.28, height: 841.89 };
const M = 44; // marge
const CONTENT = A4.width - 2 * M;

const INK = rgb(0.067, 0.067, 0.067);
const MUTED = rgb(0.4, 0.4, 0.4);
const SUBTLE = rgb(0.6, 0.6, 0.6);
const PAPER = rgb(0.984, 0.973, 0.953);
const GREEN = rgb(0.863, 0.898, 0.839);
const GREEN_INK = rgb(0.227, 0.267, 0.22);
const SAND = rgb(0.953, 0.914, 0.863);
const SAND_INK = rgb(0.353, 0.29, 0.22);
const LINE = rgb(0.909, 0.886, 0.847);
const HAIR = rgb(0.933, 0.914, 0.882);
const RED = rgb(0.69, 0.282, 0.243);

// Fonds des vignettes produit, par teinte (mêmes valeurs que les jetons du site).
const TINT: Record<string, RGB> = {
  green: rgb(0.863, 0.898, 0.839),
  blue: rgb(0.89, 0.91, 0.941),
  pink: rgb(0.941, 0.878, 0.91),
  sand: rgb(0.953, 0.914, 0.863),
};
const tintRgb = (t?: string): RGB => TINT[t ?? "green"] ?? TINT.green;

/** Télécharge et incorpore une image (PNG/JPEG) ; renvoie null en cas d'échec (best-effort). */
async function embedImage(doc: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf[0] === 0x89 && buf[1] === 0x50) return await doc.embedPng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return await doc.embedJpg(buf);
    return null;
  } catch {
    return null;
  }
}

// WinAnsi (CP1252) encode ces caractères hors ASCII, dont les tirets cadratin/demi-cadratin
// qui peuvent venir d'un contenu dynamique (titre, adresse) — on les garde affichables.
const WINANSI_EXTRA = new Set(["€", "–", "—", "‘", "’", "“", "”", "…", "Œ", "œ", "•", "×", "·", "°"]);
function safe(text: string): string {
  return Array.from((text ?? "").normalize("NFC"))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) return ch;
      return "?";
    })
    .join("");
}

export type InvoiceData = { issueDate?: number; dueDate?: number; totalHt?: number; totalTtc?: number; vatAmount?: number };
export type InvoiceMeta = { number: string; issuedAt: number; data?: InvoiceData };

export async function renderInvoicePdf(order: Order, settings: SiteSettings, invoice: InvoiceMeta, tints: Record<string, string> = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.width, A4.height]);
  const w = new Writer(page, font, bold);

  const sellerName = settings.legal.sellerName || settings.shopName;
  const vatApplies = Boolean(settings.legal.vatNumber) && (invoice.data?.vatAmount ?? 0) > 0;
  const issuedAt = invoice.data?.issueDate ?? invoice.issuedAt;
  const paid = order.status !== "pending_payment" && order.status !== "cancelled";
  const rightX = A4.width - M;

  doc.setTitle(`Facture ${invoice.number} - ${sellerName}`);
  doc.setAuthor(sellerName);
  doc.setCreationDate(new Date(invoice.issuedAt));

  /* ---- En-tête ---- */
  const logo = await loadLogo(doc);
  let leftY: number;
  if (logo) {
    const h = 30;
    const lw = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M, y: A4.height - M - h, width: lw, height: h });
    leftY = M + h + 12;
  } else {
    w.text(sellerName, M, M + 6, { font: bold, size: 18 });
    leftY = M + 26;
  }
  const sellerLines = [sellerName, ...settings.legal.sellerAddressLines];
  const idLine = [settings.legal.siret && `SIREN ${settings.legal.siret}`, settings.legal.vatNumber ? `TVA ${settings.legal.vatNumber}` : "TVA non applicable"].filter(Boolean).join(" · ");
  if (idLine) sellerLines.push(idLine);
  if (settings.contact.email) sellerLines.push(settings.contact.email);
  w.lines(sellerLines, M, leftY, { size: 8.5, color: MUTED, leading: 12 });

  // Bloc droite : titre + métadonnées + pastille payée.
  w.text("Facture", rightX, M + 4, { font: bold, size: 25, align: "right" });
  const meta: Array<[string, string]> = [
    ["N° de facture", invoice.number],
    ["Commande", order.number],
    ["Date d'émission", dateFr(issuedAt)],
    ["Paiement", paid ? "Carte bancaire · réglée" : "En attente"],
  ];
  let my = M + 40;
  for (const [k, v] of meta) {
    w.text(k, rightX - 150, my, { size: 9, color: SUBTLE, font: bold });
    w.text(v, rightX, my, { size: 9, font: bold, align: "right" });
    my += 15;
  }
  if (paid) {
    const label = `Payée le ${dateFr(issuedAt)}`;
    const tw = bold.widthOfTextAtSize(safe(label), 8.5) + 24;
    w.rect(rightX - tw, my + 2, tw, 20, GREEN);
    w.text(label, rightX - 12, my + 7, { size: 8.5, font: bold, color: GREEN_INK, align: "right" });
  }

  /* ---- Cartes Facturé / Livré / Précommande ---- */
  const preorder = order.lines.some((l) => l.preorder && !l.gift);
  const cardsY = 172;
  const gap = 10;
  const cardW = (CONTENT - 2 * gap) / 3;
  const cardH = 92;
  const billing = order.billingAddress ?? order.shippingAddress;

  card(w, M, cardsY, cardW, cardH, PAPER, "Facturé à", SUBTLE, INK, billing.name, [...addressTail(billing), order.email]);
  const del = deliveryBlock(order);
  card(w, M + cardW + gap, cardsY, cardW, cardH, PAPER, "Livré à", SUBTLE, INK, del.title, del.lines);
  if (preorder) {
    const ship = settings.shipping.preorderShipFrom ? dateFr(new Date(settings.shipping.preorderShipFrom).getTime()) : null;
    card(w, M + 2 * (cardW + gap), cardsY, cardW, cardH, SAND, "Précommande", SAND_INK, SAND_INK, ship ? `Expédition dès le ${ship}` : "Expédition annoncée par e-mail", ["Tous les livres dans un seul colis."]);
  } else {
    card(w, M + 2 * (cardW + gap), cardsY, cardW, cardH, PAPER, "Livraison", SUBTLE, INK, order.delivery?.rateName || "Standard", ["Suivi envoyé au départ du colis."]);
  }

  /* ---- Tableau des lignes ---- */
  const imgX = M;
  const imgS = 30;
  const col = { des: M + imgS + 12, ref: M + 250, qty: M + 330, pu: M + 415, tot: rightX };
  let y = cardsY + cardH + 26;
  w.text("Désignation", col.des, y, { size: 8, font: bold, color: SUBTLE });
  w.text("Référence", col.ref, y, { size: 8, font: bold, color: SUBTLE });
  w.text("Qté", col.qty, y, { size: 8, font: bold, color: SUBTLE, align: "right" });
  w.text(vatApplies ? "P.U. HT" : "P.U.", col.pu, y, { size: 8, font: bold, color: SUBTLE, align: "right" });
  w.text(vatApplies ? "Total TTC" : "Total", col.tot, y, { size: 8, font: bold, color: SUBTLE, align: "right" });
  y += 13; // sous le texte de l'en-tête (taille 8) avant le filet
  line(page, M, rightX, y, 1.2, INK);
  y += 15;

  // Vignettes produit incorporées en amont (téléchargement best-effort, en parallèle).
  const lineImages = await Promise.all(order.lines.map((l) => embedImage(doc, l.image?.url)));

  type RowOpts = { name: string; sub?: string; ref?: string; qty?: string; pu?: string; total: string; totalColor?: RGB; img?: PDFImage | null; tint?: string };
  const drawRow = (o: RowOpts) => {
    const top = y;
    const hasThumb = o.img !== undefined; // ligne produit : carré teinté même sans image
    if (hasThumb) {
      w.rect(imgX, top - 1, imgS, imgS, tintRgb(o.tint));
      if (o.img) {
        const scale = Math.min((imgS - 8) / o.img.width, (imgS - 8) / o.img.height);
        const iw = o.img.width * scale;
        const ih = o.img.height * scale;
        const squareBottom = A4.height - (top - 1) - imgS;
        page.drawImage(o.img, { x: imgX + (imgS - iw) / 2, y: squareBottom + (imgS - ih) / 2, width: iw, height: ih });
      }
    }
    const end = w.wrapped(o.name, col.des, top, { size: 9.5, font: bold, maxWidth: col.ref - col.des - 12, leading: 12 });
    if (o.sub) w.text(o.sub, col.des, end + 1, { size: 8, color: SUBTLE });
    if (o.ref) w.text(o.ref, col.ref, top, { size: 8.5, color: MUTED, font: bold });
    if (o.qty) w.text(o.qty, col.qty, top, { size: 9.5, align: "right" });
    if (o.pu) w.text(o.pu, col.pu, top, { size: 9.5, align: "right" });
    w.text(o.total, col.tot, top, { size: 9.5, font: bold, align: "right", color: o.totalColor });
    const textBottom = o.sub ? end + 9 : end - 2;
    const bottom = Math.max(textBottom, hasThumb ? top - 1 + imgS : 0, top + 22);
    y = bottom + 10;
    line(page, M, rightX, y - 6, 0.6, HAIR);
  };

  order.lines.forEach((l, i) => {
    drawRow({
      name: l.title,
      sub: l.gift ? "Offert" : "Imagier cartonné · 6-18 mois",
      ref: reference(l.productSlug),
      qty: String(l.qty),
      pu: l.gift ? "Offert" : formatEuro(l.unitPrice),
      total: l.gift ? "0,00 €" : formatEuro(l.unitPrice * l.qty),
      totalColor: l.gift ? GREEN_INK : undefined,
      img: lineImages[i],
      tint: tints[l.productSlug],
    });
  });
  if (order.totals.shipping > 0) {
    drawRow({ name: `Livraison - ${order.delivery?.rateName || "standard"}`, sub: order.delivery?.relay ? "Point relais via Boxtal" : "Via Boxtal", qty: "1", pu: formatEuro(order.totals.shipping), total: formatEuro(order.totals.shipping) });
  }
  if (order.totals.discount > 0) {
    const codes = order.promoCodes.length ? ` - code ${order.promoCodes.join(", ")}` : "";
    drawRow({ name: `Remise${codes}`, sub: "Sur les articles", total: `-${formatEuro(order.totals.discount)}`, totalColor: RED });
  }

  /* ---- Totaux + conditions ---- */
  y += 12;
  const boxW = 240;
  const boxX = rightX - boxW;

  // Conditions (gauche).
  const conditions = [
    "Facture acquittée : paiement reçu à la commande.",
    !vatApplies && settings.legal.vatNote ? settings.legal.vatNote : "",
    "Droit de rétractation de 14 jours à compter de la réception.",
    preorder ? "Article(s) en précommande : expédition à la date annoncée." : "",
  ].filter(Boolean) as string[];
  w.text("Conditions", M, y, { size: 8, font: bold, color: SUBTLE });
  let cy = y + 14;
  for (const c of conditions) cy = w.wrapped(c, M, cy, { size: 8.5, color: MUTED, maxWidth: boxX - M - 24, leading: 12 }) + 4;

  // Encadré totaux (droite).
  const rows: Array<[string, string, RGB?]> = [[vatApplies ? "Articles HT" : "Sous-total articles", formatEuro(articlesTotal(order))]];
  if (order.totals.discount > 0) rows.push(["Remise", `-${formatEuro(order.totals.discount)}`, RED]);
  rows.push(["Livraison", order.totals.shipping === 0 ? "Offerte" : formatEuro(order.totals.shipping)]);
  const boxH = 62 + rows.length * 16 + (vatApplies ? 38 : 16);
  w.rect(boxX, y, boxW, boxH, PAPER);
  const pad = 16;
  let by = y + 18;
  for (const [k, v, color] of rows) {
    w.text(k, boxX + pad, by, { size: 9.5, color: MUTED, font: bold });
    w.text(v, boxX + boxW - pad, by, { size: 9.5, font: bold, align: "right", color });
    by += 16;
  }
  if (vatApplies) {
    line(page, boxX + pad, boxX + boxW - pad, by - 2, 0.6, LINE);
    w.text("Total HT", boxX + pad, by + 4, { size: 9.5, color: MUTED, font: bold });
    w.text(formatEuro(invoice.data?.totalHt ?? order.totals.total), boxX + boxW - pad, by + 4, { size: 9.5, font: bold, align: "right" });
    by += 20;
    w.text("TVA", boxX + pad, by, { size: 9.5, color: MUTED, font: bold });
    w.text(formatEuro(invoice.data?.vatAmount ?? 0), boxX + boxW - pad, by, { size: 9.5, font: bold, align: "right" });
    by += 18;
  } else {
    w.text("TVA non applicable", boxX + pad, by, { size: 8.5, color: SUBTLE, font: bold });
    by += 16;
  }
  line(page, boxX + pad, boxX + boxW - pad, by, 1.4, INK);
  by += 8;
  w.text(vatApplies ? "Total TTC" : "Total", boxX + pad, by, { size: 11, font: bold });
  w.text(formatEuro(order.totals.total), boxX + boxW - pad, by, { size: 15, font: bold, align: "right" });
  by += 22;
  w.rect(boxX + pad, by, boxW - 2 * pad, 22, GREEN);
  w.text("Réglé", boxX + pad + 12, by + 7, { size: 9, font: bold, color: GREEN_INK });
  w.text(formatEuro(order.totals.total), boxX + boxW - pad - 12, by + 7, { size: 9, font: bold, color: GREEN_INK, align: "right" });

  /* ---- Pied de page ---- */
  const footerY = A4.height - 34;
  line(page, M, rightX, footerY - 12, 0.6, LINE);
  w.text("Merci de faire grandir votre enfant avec du vrai.", M, footerY, { size: 10, font: bold });
  const legal = [sellerName, settings.legal.siret ? `SIREN ${settings.legal.siret}` : null, "monvrai.fr", `Facture ${invoice.number} · page 1/1`].filter(Boolean).join(" · ");
  w.text(legal, rightX, footerY, { size: 7.5, color: SUBTLE, align: "right" });

  return doc.save();
}

/* ---------- Données dérivées ---------- */

function articlesTotal(order: Order): number {
  return order.lines.filter((l) => !l.gift).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

// Référence produit compacte façon « MV-ANIM-FERM » à partir du slug (sans les articles).
const REF_STOP = new Set(["le", "la", "les", "de", "des", "du", "l", "d", "un", "une"]);
function reference(slug: string): string {
  const words = (slug || "").split("-").filter((x) => x && !REF_STOP.has(x));
  const parts = (words.length ? words : (slug || "").split("-")).filter(Boolean).slice(0, 2).map((x) => x.slice(0, 4).toUpperCase());
  return parts.length ? `MV-${parts.join("-")}` : "";
}

function addressTail(a: Address): string[] {
  const out = [a.line1];
  if (a.line2) out.push(a.line2);
  out.push(`${a.postalCode} ${a.city}${a.country !== "FR" ? `, ${countryName(a.country)}` : ""}`);
  return out;
}

function deliveryBlock(order: Order): { title: string; lines: string[] } {
  const relay = order.delivery?.relay;
  if (relay) return { title: `Point relais - ${relay.name}`, lines: [[relay.street, `${relay.postalCode} ${relay.city}`].filter(Boolean).join(", "), order.delivery?.rateName || "Point relais via Boxtal"] };
  const a = order.shippingAddress;
  return { title: a.name, lines: addressTail(a) };
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function dateFr(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

async function loadLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "email-logo.png"));
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

/* ---------- Primitives de mise en page ---------- */

type TextOpts = { font?: PDFFont; size?: number; color?: RGB; align?: "left" | "right" | "center" };

function line(page: PDFPage, x1: number, x2: number, yFromTop: number, thickness = 0.6, color: RGB = LINE): void {
  page.drawLine({ start: { x: x1, y: A4.height - yFromTop }, end: { x: x2, y: A4.height - yFromTop }, thickness, color });
}

function card(w: Writer, x: number, yFromTop: number, width: number, height: number, bg: RGB, label: string, labelColor: RGB, bodyColor: RGB, title: string, body: string[]): void {
  w.rect(x, yFromTop, width, height, bg);
  w.text(label.toUpperCase(), x + 14, yFromTop + 14, { size: 7.5, font: w.bold, color: labelColor });
  let ty = w.wrapped(title, x + 14, yFromTop + 30, { size: 9.5, font: w.bold, color: bodyColor, maxWidth: width - 28, leading: 12 }) + 2;
  for (const raw of body) {
    if (!raw) continue;
    ty = w.wrapped(raw, x + 14, ty, { size: 9, color: bodyColor, maxWidth: width - 28, leading: 12 }) + 2;
  }
}

/** Coordonnées depuis le haut de la page ; alignement et retours à la ligne. */
class Writer {
  constructor(
    private page: PDFPage,
    public regular: PDFFont,
    public bold: PDFFont,
  ) {}

  text(raw: string, x: number, yFromTop: number, opts: TextOpts = {}): void {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? 10;
    const text = safe(raw);
    const width = font.widthOfTextAtSize(text, size);
    const startX = opts.align === "right" ? x - width : opts.align === "center" ? x - width / 2 : x;
    this.page.drawText(text, { x: startX, y: A4.height - yFromTop - size, size, font, color: opts.color ?? INK });
  }

  lines(items: string[], x: number, yFromTop: number, opts: TextOpts & { leading?: number } = {}): number {
    let y = yFromTop;
    for (const item of items) {
      if (item) this.text(item, x, y, opts);
      y += opts.leading ?? 14;
    }
    return y;
  }

  wrapped(raw: string, x: number, yFromTop: number, opts: TextOpts & { maxWidth: number; leading?: number }): number {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? 10;
    const words = safe(raw).split(/\s+/);
    const out: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > opts.maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    return this.lines(out, x, yFromTop, { ...opts, leading: opts.leading ?? 13 });
  }

  rect(x: number, yFromTop: number, width: number, height: number, color: RGB): void {
    this.page.drawRectangle({ x, y: A4.height - yFromTop - height, width, height, color });
  }
}
