import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import sharp from "sharp";
import type { Address, Order } from "@/lib/domain/types";

/*
 * Primitives de mise en page des documents PDF de la boutique — la facture
 * (`lib/invoice/pdf.ts`) et le bon de livraison (`lib/pdf/order-slip.ts`). Les deux
 * documents partagent la même page A4, la même palette (les jetons du site), les mêmes
 * vignettes produit et le même `Writer` : ce qui est mis ici doit servir aux deux, ce qui
 * n'appartient qu'à un document reste chez lui.
 *
 * Polices standard (WinAnsi) : les caractères hors Latin-1 sont nettoyés par `safe`.
 */

export const A4 = { width: 595.28, height: 841.89 };
export const M = 44; // marge
export const CONTENT = A4.width - 2 * M;
export const FOOTER_Y = A4.height - 34; // ligne de base du pied de page
export const BOTTOM = FOOTER_Y - 36; // limite basse du contenu
const THUMB_PX = 120; // côté max des vignettes incorporées (30 pt affichés, net à l'impression)

export const INK = rgb(0.067, 0.067, 0.067);
export const MUTED = rgb(0.4, 0.4, 0.4);
export const SUBTLE = rgb(0.6, 0.6, 0.6);
export const PAPER = rgb(0.984, 0.973, 0.953);
export const GREEN = rgb(0.863, 0.898, 0.839);
export const GREEN_INK = rgb(0.227, 0.267, 0.22);
export const SAND = rgb(0.953, 0.914, 0.863);
export const SAND_INK = rgb(0.353, 0.29, 0.22);
export const LINE = rgb(0.909, 0.886, 0.847);
export const HAIR = rgb(0.933, 0.914, 0.882);
export const RED = rgb(0.69, 0.282, 0.243);

// Fonds des vignettes produit, par teinte (mêmes valeurs que les jetons du site).
const TINT: Record<string, RGB> = {
  green: rgb(0.863, 0.898, 0.839),
  blue: rgb(0.89, 0.91, 0.941),
  pink: rgb(0.941, 0.878, 0.91),
  sand: rgb(0.953, 0.914, 0.863),
};
export const tintRgb = (t?: string): RGB => TINT[t ?? "green"] ?? TINT.green;

/**
 * Télécharge une image produit, la réduit en vignette PNG et l'incorpore ; null en cas
 * d'échec (best-effort : la facture se passe d'image plutôt que d'échouer).
 */
async function embedThumb(doc: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());
    const png = await sharp(original).resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    return await doc.embedPng(png);
  } catch {
    return null;
  }
}

/** Une vignette par URL distincte : deux lignes du même titre partagent l'image. */
export async function embedThumbs(doc: PDFDocument, urls: (string | undefined)[]): Promise<(PDFImage | null)[]> {
  const unique = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));
  const embedded = await Promise.all(unique.map((u) => embedThumb(doc, u)));
  const byUrl = new Map(unique.map((u, i) => [u, embedded[i]]));
  return urls.map((u) => (u ? (byUrl.get(u) ?? null) : null));
}

// WinAnsi (CP1252) encode ces caractères hors ASCII, dont les tirets cadratin/demi-cadratin
// qui peuvent venir d'un contenu dynamique (titre, adresse) — on les garde affichables.
const WINANSI_EXTRA = new Set(["€", "–", "—", "‘", "’", "“", "”", "…", "Œ", "œ", "•", "×", "·", "°"]);
export function safe(text: string): string {
  return Array.from((text ?? "").normalize("NFC"))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) return ch;
      return "?";
    })
    .join("");
}

/* ---------- Données dérivées ---------- */

// Référence produit compacte façon « MV-ANIM-FERM » à partir du slug (sans les articles).
const REF_STOP = new Set(["le", "la", "les", "de", "des", "du", "l", "d", "un", "une"]);
export function reference(slug: string): string {
  const words = (slug || "").split("-").filter((x) => x && !REF_STOP.has(x));
  const parts = (words.length ? words : (slug || "").split("-")).filter(Boolean).slice(0, 2).map((x) => x.slice(0, 4).toUpperCase());
  return parts.length ? `MV-${parts.join("-")}` : "";
}

export function addressTail(a: Address): string[] {
  const out = [a.line1];
  if (a.line2) out.push(a.line2);
  out.push(`${a.postalCode} ${a.city}${a.country !== "FR" ? `, ${countryName(a.country)}` : ""}`);
  return out;
}

export function deliveryBlock(order: Order): { title: string; lines: string[] } {
  const relay = order.delivery?.relay;
  if (relay) return { title: `Point relais - ${relay.name}`, lines: [[relay.street, `${relay.postalCode} ${relay.city}`].filter(Boolean).join(", "), order.delivery?.rateName || "Point relais via Boxtal"] };
  const a = order.shippingAddress;
  return { title: a.name, lines: addressTail(a) };
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function dateFr(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export async function loadLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "email-logo.png"));
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

/* ---------- Primitives de mise en page ---------- */

export type TextOpts = { font?: PDFFont; size?: number; color?: RGB; align?: "left" | "right" | "center" };

export function card(w: Writer, x: number, yFromTop: number, width: number, height: number, bg: RGB, label: string, labelColor: RGB, bodyColor: RGB, title: string, body: string[]): void {
  w.rect(x, yFromTop, width, height, bg);
  w.text(label.toUpperCase(), x + 14, yFromTop + 14, { size: 7.5, font: w.bold, color: labelColor });
  let ty = w.wrapped(title, x + 14, yFromTop + 30, { size: 9.5, font: w.bold, color: bodyColor, maxWidth: width - 28, leading: 12 }) + 2;
  for (const raw of body) {
    if (!raw) continue;
    ty = w.wrapped(raw, x + 14, ty, { size: 9, color: bodyColor, maxWidth: width - 28, leading: 12 }) + 2;
  }
}

/**
 * Écriture sur la page courante, en coordonnées depuis le haut de la page ; alignement,
 * retours à la ligne, et gestion des pages (la première est créée d'emblée).
 */
export class Writer {
  readonly pages: PDFPage[] = [];
  private page: PDFPage;

  constructor(
    private doc: PDFDocument,
    public regular: PDFFont,
    public bold: PDFFont,
  ) {
    this.page = this.newPage();
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    return this.page;
  }

  /** Revient sur une page existante (pieds de page, une fois toutes les pages connues). */
  use(page: PDFPage): void {
    this.page = page;
  }

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

  /** Découpe en lignes tenant dans maxWidth (mots entiers). Sert aussi à mesurer avant de dessiner. */
  wrapLines(raw: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = safe(raw).split(/\s+/);
    const out: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    return out;
  }

  wrapped(raw: string, x: number, yFromTop: number, opts: TextOpts & { maxWidth: number; leading?: number }): number {
    const out = this.wrapLines(raw, opts.font ?? this.regular, opts.size ?? 10, opts.maxWidth);
    return this.lines(out, x, yFromTop, { ...opts, leading: opts.leading ?? 13 });
  }

  rect(x: number, yFromTop: number, width: number, height: number, color: RGB): void {
    this.page.drawRectangle({ x, y: A4.height - yFromTop - height, width, height, color });
  }

  line(x1: number, x2: number, yFromTop: number, thickness = 0.6, color: RGB = LINE): void {
    this.page.drawLine({ start: { x: x1, y: A4.height - yFromTop }, end: { x: x2, y: A4.height - yFromTop }, thickness, color });
  }

  image(img: PDFImage, x: number, yFromTop: number, width: number, height: number): void {
    this.page.drawImage(img, { x, y: A4.height - yFromTop - height, width, height });
  }
}
