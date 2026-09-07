import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatEuro } from "@/lib/domain/money";
import type { Address, Order, SiteSettings } from "@/lib/domain/types";

/*
 * Rendu PDF d'une facture. Volontairement sobre : une page A4, polices standard
 * (pas de fichier de police à embarquer), tout ce que le Code de commerce exige —
 * numéro, date, vendeur, client, lignes, totaux, mention TVA — et rien de plus.
 *
 * Les polices standard n'encodent que le Latin-1 (WinAnsi) : les caractères hors de
 * cette plage sont remplacés, sinon pdf-lib lève une exception au milieu du rendu.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const WINANSI_EXTRA = new Set(["€", "–", "—", "‘", "’", "“", "”", "…", "Œ", "œ", "•"]);
function safe(text: string): string {
  return Array.from(text.normalize("NFC"))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) return ch;
      return "?";
    })
    .join("");
}

export async function renderInvoicePdf(order: Order, settings: SiteSettings): Promise<Uint8Array> {
  if (!order.invoice) throw new Error("La commande n'a pas de numéro de facture");

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.width, A4.height]);

  const sellerName = settings.legal.sellerName || settings.shopName;
  doc.setTitle(`Facture ${order.invoice.number} — ${sellerName}`);
  doc.setAuthor(sellerName);
  doc.setCreationDate(new Date(order.invoice.issuedAt));

  const w = new Writer(page, regular);

  // En-tête : vendeur à gauche, titre et numéro à droite.
  w.text(sellerName, MARGIN, 60, { font: bold, size: 18 });
  const sellerLines = [...(settings.legal.sellerAddressLines.length ? settings.legal.sellerAddressLines : settings.contact.addressLines)];
  if (settings.contact.email) sellerLines.push(settings.contact.email);
  if (settings.legal.siret) sellerLines.push(`SIRET ${settings.legal.siret}`);
  if (settings.legal.vatNumber) sellerLines.push(`TVA ${settings.legal.vatNumber}`);
  w.lines(sellerLines, MARGIN, 84, { size: 9.5, color: MUTED, leading: 13 });

  w.text("FACTURE", A4.width - MARGIN, 60, { font: bold, size: 18, align: "right" });
  w.lines(
    [
      `N° ${order.invoice.number}`,
      `Émise le ${dateFr(order.invoice.issuedAt)}`,
      `Commande ${order.number} du ${dateFr(order.createdAt)}`,
      order.status === "refunded" ? "Commande remboursée" : "Payée par carte (Stripe)",
    ],
    A4.width - MARGIN,
    84,
    { size: 9.5, color: MUTED, leading: 13, align: "right" },
  );

  // Adresses : facturation à gauche, livraison à droite.
  const billing = order.billingAddress ?? order.shippingAddress;
  let y = 180;
  w.text("Facturé à", MARGIN, y, { font: bold, size: 9, color: MUTED });
  w.text("Livré à", A4.width / 2, y, { font: bold, size: 9, color: MUTED });
  y += 16;
  const billingEnd = w.lines(addressLines(billing, order.email), MARGIN, y, { size: 10, leading: 14 });
  const shippingEnd = w.lines(addressLines(order.shippingAddress), A4.width / 2, y, { size: 10, leading: 14 });
  y = Math.max(billingEnd, shippingEnd) + 28;

  // Tableau des lignes.
  const cols = { title: MARGIN, qty: 380, unit: 450, total: A4.width - MARGIN };
  w.rule(y - 12);
  w.text("Désignation", cols.title, y, { font: bold, size: 9, color: MUTED });
  w.text("Qté", cols.qty, y, { font: bold, size: 9, color: MUTED, align: "right" });
  w.text("P.U. TTC", cols.unit, y, { font: bold, size: 9, color: MUTED, align: "right" });
  w.text("Total TTC", cols.total, y, { font: bold, size: 9, color: MUTED, align: "right" });
  y += 10;
  w.rule(y);
  y += 16;
  for (const line of order.lines) {
    const label = line.preorder ? `${line.title} (précommande)` : line.title;
    const end = w.wrapped(label, cols.title, y, { size: 10, maxWidth: cols.qty - 40 - cols.title, leading: 13 });
    w.text(String(line.qty), cols.qty, y, { size: 10, align: "right" });
    w.text(formatEuro(line.unitPrice), cols.unit, y, { size: 10, align: "right" });
    w.text(formatEuro(line.unitPrice * line.qty), cols.total, y, { size: 10, align: "right" });
    y = end + 8;
  }
  w.rule(y);
  y += 18;

  // Totaux.
  const t = order.totals;
  const totals: Array<[string, string, boolean]> = [
    ["Sous-total", formatEuro(t.subtotal), false],
    ["Livraison", t.shipping === 0 ? "Offerte" : formatEuro(t.shipping), false],
  ];
  if (t.discount) totals.push(["Remise", `−${formatEuro(t.discount)}`, false]);
  if (t.tax) totals.push(["dont TVA", formatEuro(t.tax), false]);
  totals.push(["Total TTC", formatEuro(t.total), true]);
  for (const [label, value, strong] of totals) {
    w.text(label, cols.unit - 90, y, { size: strong ? 11 : 10, font: strong ? bold : regular, color: strong ? INK : MUTED });
    w.text(value, cols.total, y, { size: strong ? 11 : 10, font: strong ? bold : regular, align: "right" });
    y += strong ? 20 : 16;
  }

  // Mentions.
  y += 12;
  const notes: string[] = [];
  if (!t.tax && settings.legal.vatNote) notes.push(settings.legal.vatNote);
  notes.push("Facture acquittée : paiement reçu à la commande.");
  if (order.lines.some((l) => l.preorder)) notes.push("Article(s) en précommande : expédition à la date annoncée sur la fiche produit.");
  w.lines(notes, MARGIN, y, { size: 8.5, color: MUTED, leading: 12 });

  // Pied de page.
  const footer = [sellerName, settings.legal.siret ? `SIRET ${settings.legal.siret}` : null, settings.contact.email ?? null].filter(Boolean).join(" · ");
  w.text(footer, A4.width / 2, A4.height - 36, { size: 8, color: MUTED, align: "center" });

  return doc.save();
}

function addressLines(a: Address, email?: string): string[] {
  const out = [a.name, a.line1];
  if (a.line2) out.push(a.line2);
  out.push(`${a.postalCode} ${a.city}`);
  if (a.country !== "FR") out.push(countryName(a.country));
  if (email) out.push(email);
  if (a.phone) out.push(a.phone);
  return out;
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

type TextOpts = { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center" };

/** Petit assistant : coordonnées depuis le haut de la page, alignement, retours à la ligne. */
class Writer {
  constructor(
    private page: PDFPage,
    private regular: PDFFont,
  ) {}

  text(raw: string, x: number, yFromTop: number, opts: TextOpts = {}): void {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? 10;
    const text = safe(raw);
    const width = font.widthOfTextAtSize(text, size);
    const startX = opts.align === "right" ? x - width : opts.align === "center" ? x - width / 2 : x;
    this.page.drawText(text, { x: startX, y: A4.height - yFromTop - size, size, font, color: opts.color ?? INK });
  }

  /** Écrit des lignes successives ; renvoie l'ordonnée sous la dernière. */
  lines(items: string[], x: number, yFromTop: number, opts: TextOpts & { leading?: number } = {}): number {
    let y = yFromTop;
    for (const item of items) {
      this.text(item, x, y, opts);
      y += opts.leading ?? 14;
    }
    return y;
  }

  /** Texte replié sur la largeur donnée ; renvoie l'ordonnée sous la dernière ligne. */
  wrapped(raw: string, x: number, yFromTop: number, opts: TextOpts & { maxWidth: number; leading?: number }): number {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? 10;
    const words = safe(raw).split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > opts.maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return this.lines(lines, x, yFromTop, { ...opts, leading: opts.leading ?? 13 });
  }

  rule(yFromTop: number): void {
    this.page.drawLine({ start: { x: MARGIN, y: A4.height - yFromTop }, end: { x: A4.width - MARGIN, y: A4.height - yFromTop }, thickness: 0.6, color: LINE });
  }
}
