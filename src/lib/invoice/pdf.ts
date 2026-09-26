import "server-only";
import { PDFDocument, StandardFonts, type PDFImage, type RGB } from "pdf-lib";
import { formatEuro } from "@/lib/domain/money";
import type { Order, SiteSettings } from "@/lib/domain/types";
import { A4, BOTTOM, CONTENT, FOOTER_Y, GREEN, GREEN_INK, HAIR, INK, LINE, M, MUTED, PAPER, RED, SAND, SAND_INK, SUBTLE, Writer, addressTail, card, dateFr, deliveryBlock, embedThumbs, loadLogo, reference, safe, tintRgb } from "@/lib/pdf/layout";

/*
 * Rendu PDF de la facture (maquette « Mon Vrai - Facture »). Le numéro, les dates et les
 * totaux viennent de Tiime (via Make) ; le détail des lignes, les adresses et la livraison
 * viennent de la commande. La facture s'adapte à la configuration : en franchise de TVA
 * (pas de numéro de TVA), on affiche « TVA non applicable, art. 293 B du CGI » et pas de
 * colonne de taxe. La page, la palette et le `Writer` viennent de `lib/pdf/layout.ts`,
 * partagés avec le bon de livraison.
 *
 * Pagination : le tableau des lignes et le bloc des totaux passent à la page suivante
 * quand ils n'ont plus la place au-dessus du pied de page ; chaque page porte « page n/N ».
 * Les vignettes produit sont réduites (sharp) avant incorporation : une image de
 * catalogue pèse plus d'un mégaoctet, une vignette de facture quelques kilo-octets.
 */

export type InvoiceData = { issueDate?: number; dueDate?: number; totalHt?: number; totalTtc?: number; vatAmount?: number };
export type InvoiceMeta = { number: string; issuedAt: number; data?: InvoiceData };

export async function renderInvoicePdf(order: Order, settings: SiteSettings, invoice: InvoiceMeta, tints: Record<string, string> = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

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
    w.image(logo, M, M, lw, h);
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
  const nameWidth = col.ref - col.des - 12;

  const tableHead = (top: number): number => {
    w.text("Désignation", col.des, top, { size: 8, font: bold, color: SUBTLE });
    w.text("Référence", col.ref, top, { size: 8, font: bold, color: SUBTLE });
    w.text("Qté", col.qty, top, { size: 8, font: bold, color: SUBTLE, align: "right" });
    w.text(vatApplies ? "P.U. HT" : "P.U.", col.pu, top, { size: 8, font: bold, color: SUBTLE, align: "right" });
    w.text(vatApplies ? "Total TTC" : "Total", col.tot, top, { size: 8, font: bold, color: SUBTLE, align: "right" });
    w.line(M, rightX, top + 13, 1.2, INK); // sous le texte de l'en-tête (taille 8)
    return top + 28;
  };

  // Nouvelle page de suite : rappel discret de la facture, puis l'en-tête du tableau.
  const continueOnNewPage = (withTableHead: boolean): number => {
    w.newPage();
    const top = M;
    w.text(`Facture ${invoice.number} · Commande ${order.number} · suite`, M, top, { size: 8.5, color: SUBTLE, font: bold });
    w.line(M, rightX, top + 16, 0.6, LINE);
    return withTableHead ? tableHead(top + 30) : top + 30;
  };

  let y = tableHead(cardsY + cardH + 26);

  // Vignettes produit incorporées en amont (téléchargement et réduction en parallèle).
  const lineImages = await embedThumbs(doc, order.lines.map((l) => l.image?.url));

  type RowOpts = { name: string; sub?: string; ref?: string; qty?: string; pu?: string; total: string; totalColor?: RGB; img?: PDFImage | null; tint?: string };
  const rowHeight = (o: RowOpts): number => {
    const nameLines = w.wrapLines(o.name, bold, 9.5, nameWidth).length;
    const textBottom = nameLines * 12 + (o.sub ? 9 : -2);
    return Math.max(textBottom, o.img !== undefined ? imgS - 1 : 0, 22) + 10;
  };
  const drawRow = (o: RowOpts) => {
    if (y + rowHeight(o) > BOTTOM) y = continueOnNewPage(true);
    const top = y;
    const hasThumb = o.img !== undefined; // ligne produit : carré teinté même sans image
    if (hasThumb) {
      w.rect(imgX, top - 1, imgS, imgS, tintRgb(o.tint));
      if (o.img) {
        const scale = Math.min((imgS - 8) / o.img.width, (imgS - 8) / o.img.height);
        const iw = o.img.width * scale;
        const ih = o.img.height * scale;
        w.image(o.img, imgX + (imgS - iw) / 2, top - 1 + (imgS - ih) / 2, iw, ih);
      }
    }
    const end = w.wrapped(o.name, col.des, top, { size: 9.5, font: bold, maxWidth: nameWidth, leading: 12 });
    if (o.sub) w.text(o.sub, col.des, end + 1, { size: 8, color: SUBTLE });
    if (o.ref) w.text(o.ref, col.ref, top, { size: 8.5, color: MUTED, font: bold });
    if (o.qty) w.text(o.qty, col.qty, top, { size: 9.5, align: "right" });
    if (o.pu) w.text(o.pu, col.pu, top, { size: 9.5, align: "right" });
    w.text(o.total, col.tot, top, { size: 9.5, font: bold, align: "right", color: o.totalColor });
    y = top + rowHeight(o);
    w.line(M, rightX, y - 6, 0.6, HAIR);
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
  const boxW = 240;
  const boxX = rightX - boxW;
  const pad = 16;

  const conditions = [
    "Facture acquittée : paiement reçu à la commande.",
    !vatApplies && settings.legal.vatNote ? settings.legal.vatNote : "",
    "Droit de rétractation de 14 jours à compter de la réception.",
    preorder ? "Article(s) en précommande : expédition à la date annoncée." : "",
  ].filter(Boolean) as string[];
  const conditionsWidth = boxX - M - 24;
  const conditionsH = 14 + conditions.reduce((h, c) => h + w.wrapLines(c, font, 8.5, conditionsWidth).length * 12 + 4, 0);

  const rows: Array<[string, string, RGB?]> = [[vatApplies ? "Articles HT" : "Sous-total articles", formatEuro(articlesTotal(order))]];
  if (order.totals.discount > 0) rows.push(["Remise", `-${formatEuro(order.totals.discount)}`, RED]);
  rows.push(["Livraison", order.totals.shipping === 0 ? "Offerte" : formatEuro(order.totals.shipping)]);
  // 18 de marge haute, les lignes, la zone TVA (une ou deux lignes), le filet, le total,
  // la bande « Réglé » (22) et 14 de marge basse.
  const boxH = 18 + rows.length * 16 + (vatApplies ? 38 : 16) + 8 + 22 + 22 + 14;

  // Le bloc entier tient sur une page ; sinon il passe sur la suivante, d'un seul tenant.
  y += 12;
  if (y + Math.max(boxH, conditionsH) > BOTTOM) y = continueOnNewPage(false);

  // Conditions (gauche).
  w.text("Conditions", M, y, { size: 8, font: bold, color: SUBTLE });
  let cy = y + 14;
  for (const c of conditions) cy = w.wrapped(c, M, cy, { size: 8.5, color: MUTED, maxWidth: conditionsWidth, leading: 12 }) + 4;

  // Encadré totaux (droite).
  w.rect(boxX, y, boxW, boxH, PAPER);
  let by = y + 18;
  for (const [k, v, color] of rows) {
    w.text(k, boxX + pad, by, { size: 9.5, color: MUTED, font: bold });
    w.text(v, boxX + boxW - pad, by, { size: 9.5, font: bold, align: "right", color });
    by += 16;
  }
  if (vatApplies) {
    w.line(boxX + pad, boxX + boxW - pad, by - 2, 0.6, LINE);
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
  w.line(boxX + pad, boxX + boxW - pad, by, 1.4, INK);
  by += 8;
  w.text(vatApplies ? "Total TTC" : "Total", boxX + pad, by, { size: 11, font: bold });
  w.text(formatEuro(order.totals.total), boxX + boxW - pad, by, { size: 15, font: bold, align: "right" });
  by += 22;
  w.rect(boxX + pad, by, boxW - 2 * pad, 22, GREEN);
  w.text("Réglé", boxX + pad + 12, by + 7, { size: 9, font: bold, color: GREEN_INK });
  w.text(formatEuro(order.totals.total), boxX + boxW - pad - 12, by + 7, { size: 9, font: bold, color: GREEN_INK, align: "right" });

  /* ---- Pied de page, sur chaque page, une fois le nombre total connu ---- */
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    w.use(page);
    w.line(M, rightX, FOOTER_Y - 12, 0.6, LINE);
    w.text("Merci de faire grandir votre enfant avec du vrai.", M, FOOTER_Y, { size: 10, font: bold });
    const legal = [sellerName, settings.legal.siret ? `SIREN ${settings.legal.siret}` : null, "monvrai.fr", `Facture ${invoice.number} · page ${i + 1}/${total}`].filter(Boolean).join(" · ");
    w.text(legal, rightX, FOOTER_Y, { size: 7.5, color: SUBTLE, align: "right" });
  });

  return doc.save();
}

/* ---------- Données dérivées ---------- */

function articlesTotal(order: Order): number {
  return order.lines.filter((l) => !l.gift).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}
