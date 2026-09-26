import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ADMIN_STATUS_LABELS } from "@/lib/admin/order-ui";
import { getContest } from "@/lib/db/contests";
import { getInfluencer } from "@/lib/db/promos";
import { getProductsBySlugs } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import type { Order, SiteSettings } from "@/lib/domain/types";
import { A4, BOTTOM, CONTENT, FOOTER_Y, GREEN, GREEN_INK, HAIR, INK, LINE, M, MUTED, PAPER, SUBTLE, Writer, addressTail, card, dateFr, embedThumbs, loadLogo, reference, safe, tintRgb } from "./layout";

/*
 * Bon de livraison : à qui part le colis, et ce qu'il y a dedans. Un kit de partenaire,
 * comme le lot d'un concours, n'est jamais facturé — sans ce document, rien dans l'admin
 * ne dit ce qu'on a envoyé ni où. Il vaut pour toutes les commandes, offertes ou vendues,
 * et ne porte aucune mention comptable : la facture reste le seul document de ce genre
 * (`lib/invoice/pdf.ts`).
 *
 * Un colis offert : le bon n'y montre aucun prix. Des prix à zéro laisseraient croire à
 * un document de vente, et celui qui reçoit n'a rien réglé.
 *
 * Rendu à la volée à chaque téléchargement, jamais déposé dans le bucket : une commande
 * change (adresse corrigée, suivi ajouté) et le bon suit. C'est tout le contraire d'une
 * facture, figée au dépôt.
 */

export type SlipExtras = { partner?: string; contest?: string };

/** Le bon de livraison d'une commande, prêt à servir (teintes et partenaire compris). */
export async function orderSlipPdf(order: Order): Promise<Uint8Array> {
  const [settings, products, partner, contest] = await Promise.all([
    getSettings(),
    getProductsBySlugs(order.lines.map((l) => l.productSlug)).catch(() => new Map()),
    order.kit ? getInfluencer(order.kit.influencerId).catch(() => null) : null,
    order.prize ? getContest(order.prize.contestId).catch(() => null) : null,
  ]);
  const tints: Record<string, string> = {};
  for (const l of order.lines) {
    const p = products.get(l.productSlug);
    if (p?.tint) tints[l.productSlug] = p.tint;
  }
  return renderOrderSlipPdf(order, settings, tints, { partner: partner?.name, contest: contest?.name });
}

export async function renderOrderSlipPdf(order: Order, settings: SiteSettings, tints: Record<string, string> = {}, extras: SlipExtras = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  const sellerName = settings.legal.sellerName || settings.shopName;
  const kit = order.kit;
  const prize = order.prize;
  const money = !kit && !prize; // un colis offert : pas de colonne de prix
  const rightX = A4.width - M;
  const books = order.lines.reduce((s, l) => s + l.qty, 0);

  doc.setTitle(`Bon de livraison ${order.number} - ${sellerName}`);
  doc.setAuthor(sellerName);
  doc.setCreationDate(new Date());

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
  w.lines([sellerName, ...settings.legal.sellerAddressLines, settings.contact.email].filter((l): l is string => Boolean(l)), M, leftY, { size: 8.5, color: MUTED, leading: 12 });

  w.text("Bon de livraison", rightX, M + 4, { font: bold, size: 25, align: "right" });
  const meta: Array<[string, string]> = [
    ["Commande", order.number],
    ["Date", dateFr(order.createdAt)],
    ["Statut", ADMIN_STATUS_LABELS[order.status]],
    ["Contenu", `${books} livre${books > 1 ? "s" : ""}`],
  ];
  let my = M + 40;
  for (const [k, v] of meta) {
    w.text(k, rightX - 150, my, { size: 9, color: SUBTLE, font: bold });
    w.text(v, rightX, my, { size: 9, font: bold, align: "right" });
    my += 15;
  }
  if (kit || prize) {
    const label = prize ? "Lot de concours - offert" : "Kit de bienvenue - offert";
    const tw = bold.widthOfTextAtSize(safe(label), 8.5) + 24;
    w.rect(rightX - tw, my + 2, tw, 20, GREEN);
    w.text(label, rightX - 12, my + 7, { size: 8.5, font: bold, color: GREEN_INK, align: "right" });
  }

  /* ---- Destinataire, livraison, nature de la commande ---- */
  const cardsY = 172;
  const gap = 10;
  const cardW = (CONTENT - 2 * gap) / 3;
  // Assez haut pour une adresse complète : nom, deux lignes de rue, ville, téléphone et
  // e-mail — celui-ci passe volontiers sur deux lignes dans une colonne de ce tiers-là.
  const cardH = 120;
  const a = order.shippingAddress;

  card(w, M, cardsY, cardW, cardH, PAPER, "Destinataire", SUBTLE, INK, a.name, [...addressTail(a), a.phone ?? "", order.email]);

  const relay = order.delivery?.relay;
  const shipLines = relay ? [relay.name, [relay.street, `${relay.postalCode} ${relay.city}`].filter(Boolean).join(", ")] : ["Livraison à domicile"];
  const tracking = order.tracking ? `${order.tracking.carrier} · ${order.tracking.number}` : (order.boxtal?.trackingNumber ?? "");
  if (tracking) shipLines.push(tracking);
  card(w, M + cardW + gap, cardsY, cardW, cardH, PAPER, relay ? "Point relais" : "Livraison", SUBTLE, INK, order.delivery?.rateName || "Standard", shipLines);

  if (kit) {
    const body = [kit.seq > 1 ? `Collaboration n° ${kit.seq}` : "", kit.stock ? "Décompté du stock de vente." : "Pris sur le stock partenaire.", "Offert : aucune facture."];
    card(w, M + 2 * (cardW + gap), cardsY, cardW, cardH, GREEN, "Kit de bienvenue", GREEN_INK, GREEN_INK, extras.partner || "Partenaire", body);
  } else if (prize) {
    /* Le gagnant d'un jeu n'est pas un client : le bon dit de quel concours vient son lot. */
    const body = [prize.stock ? "Décompté du stock de vente." : "Pris sur le stock partenaire.", "Lot gagné : aucune facture."];
    card(w, M + 2 * (cardW + gap), cardsY, cardW, cardH, GREEN, "Lot de concours", GREEN_INK, GREEN_INK, extras.contest || "Concours", body);
  } else {
    const body = [order.invoice ? `Facture ${order.invoice.number}` : "Payée par carte", order.promoCodes.length ? `Code ${order.promoCodes.join(", ")}` : ""];
    card(w, M + 2 * (cardW + gap), cardsY, cardW, cardH, PAPER, "Commande", SUBTLE, INK, formatEuro(order.totals.total), body);
  }

  /* ---- Tableau des articles ---- */
  const imgX = M;
  const imgS = 30;
  const desX = M + imgS + 12;
  const refX = money ? M + 250 : M + 320;
  const qtyX = money ? M + 345 : rightX;
  const puX = M + 430;
  const nameWidth = refX - desX - 12;

  const tableHead = (top: number): number => {
    w.text("Désignation", desX, top, { size: 8, font: bold, color: SUBTLE });
    w.text("Référence", refX, top, { size: 8, font: bold, color: SUBTLE });
    w.text("Qté", qtyX, top, { size: 8, font: bold, color: SUBTLE, align: "right" });
    if (money) {
      w.text("P.U.", puX, top, { size: 8, font: bold, color: SUBTLE, align: "right" });
      w.text("Total", rightX, top, { size: 8, font: bold, color: SUBTLE, align: "right" });
    }
    w.line(M, rightX, top + 13, 1.2, INK);
    return top + 28;
  };

  // Nouvelle page de suite : rappel discret de la commande, puis l'en-tête du tableau.
  const continueOnNewPage = (withTableHead: boolean): number => {
    w.newPage();
    const top = M;
    w.text(`Bon de livraison · commande ${order.number} · suite`, M, top, { size: 8.5, color: SUBTLE, font: bold });
    w.line(M, rightX, top + 16, 0.6, LINE);
    return withTableHead ? tableHead(top + 30) : top + 30;
  };

  let y = tableHead(cardsY + cardH + 26);
  const lineImages = await embedThumbs(doc, order.lines.map((l) => l.image?.url));
  const rowHeight = (name: string, sub: string): number => Math.max(w.wrapLines(name, bold, 9.5, nameWidth).length * 12 + (sub ? 9 : -2), imgS - 1, 22) + 10;

  order.lines.forEach((l, i) => {
    const sub = l.preorder ? "Précommande" : l.gift ? "Offert" : "Imagier cartonné · 6-18 mois";
    if (y + rowHeight(l.title, sub) > BOTTOM) y = continueOnNewPage(true);
    const top = y;
    w.rect(imgX, top - 1, imgS, imgS, tintRgb(tints[l.productSlug]));
    const img = lineImages[i];
    if (img) {
      const scale = Math.min((imgS - 8) / img.width, (imgS - 8) / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      w.image(img, imgX + (imgS - iw) / 2, top - 1 + (imgS - ih) / 2, iw, ih);
    }
    const end = w.wrapped(l.title, desX, top, { size: 9.5, font: bold, maxWidth: nameWidth, leading: 12 });
    w.text(sub, desX, end + 1, { size: 8, color: SUBTLE });
    w.text(reference(l.productSlug), refX, top, { size: 8.5, color: MUTED, font: bold });
    w.text(String(l.qty), qtyX, top, { size: 9.5, align: "right" });
    if (money) {
      w.text(l.gift ? "Offert" : formatEuro(l.unitPrice), puX, top, { size: 9.5, align: "right" });
      w.text(l.gift ? "0,00 €" : formatEuro(l.unitPrice * l.qty), rightX, top, { size: 9.5, font: bold, align: "right", color: l.gift ? GREEN_INK : undefined });
    }
    y = top + rowHeight(l.title, sub);
    w.line(M, rightX, y - 6, 0.6, HAIR);
  });

  /* ---- Bande de pied : ce que contient le colis ---- */
  const stripH = 38;
  y += 12;
  if (y + stripH > BOTTOM) y = continueOnNewPage(false);
  const stripInk = money ? INK : GREEN_INK;
  w.rect(M, y, CONTENT, stripH, money ? PAPER : GREEN);
  w.text(`${books} livre${books > 1 ? "s" : ""} dans le colis`, M + 16, y + 13, { size: 10, font: bold, color: stripInk });
  w.text(money ? formatEuro(order.totals.total) : "Commande offerte", rightX - 16, y + 11, { size: 13, font: bold, color: stripInk, align: "right" });

  /* ---- Pied de page, sur chaque page, une fois le nombre total connu ---- */
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    w.use(page);
    w.line(M, rightX, FOOTER_Y - 12, 0.6, LINE);
    w.text("Merci de faire grandir votre enfant avec du vrai.", M, FOOTER_Y, { size: 10, font: bold });
    w.text([sellerName, "monvrai.fr", `Bon de livraison · commande ${order.number} · page ${i + 1}/${total}`].join(" · "), rightX, FOOTER_Y, { size: 7.5, color: SUBTLE, align: "right" });
  });

  return doc.save();
}
