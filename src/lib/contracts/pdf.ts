import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatEuro } from "@/lib/domain/money";
import { oneLineAddress } from "@/lib/promos/contract-values";
import type { ContractSignature } from "@/lib/domain/types";

/*
 * Le contrat accepté, en PDF — celui qui part en pièce jointe et que le partenaire
 * garde.
 *
 * Il est composé à partir de la SIGNATURE, jamais du contrat en base : c'est la copie
 * figée qui fait foi. Le texte est celui qui a été lu, les produits et leur valeur sont
 * ceux du jour de l'acceptation, et modifier le contrat dans l'admin ne change rien à ce
 * document.
 *
 * Polices standard (WinAnsi) : les caractères hors Latin-1 sont remplacés, sans quoi
 * pdf-lib refuse d'écrire. La mise en forme légère du texte (# titres, ** gras **,
 * * puces) est rendue ici aussi, pour que le PDF ressemble à ce qui a été lu.
 */

const A4 = { width: 595.28, height: 841.89 };
const M = 52;
const CONTENT = A4.width - 2 * M;
const BOTTOM = 64;

const INK = rgb(0.067, 0.067, 0.067);
const MUTED = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.88, 0.86, 0.83);

/*
 * WinAnsi (CP1252) va au-delà du Latin-1 : l'euro, les tirets cadratins, les guillemets
 * courbes et le signe multiplier en font partie. On les garde — écrire « 30,00 » au lieu
 * de « 30,00 € » dans un contrat serait fâcheux — et le reste devient un point
 * d'interrogation plutôt que de faire échouer l'écriture. Même règle que la facture.
 */
const WINANSI_EXTRA = new Set(["€", "–", "—", "‘", "’", "“", "”", "…", "Œ", "œ", "•", "×", "·", "°"]);
const ascii = (text: string): string =>
  Array.from((text ?? "").normalize("NFC").replace(/\u00a0/g, " "))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) return ch;
      return "?";
    })
    .join("");

type Cursor = { page: PDFPage; y: number };

export type ContractPdfFonts = { regular: PDFFont; bold: PDFFont };

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function contractPdf(signature: ContractSignature): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: ContractPdfFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const cur: Cursor = { page: doc.addPage([A4.width, A4.height]), y: A4.height - M };
  const room = (need: number) => {
    if (cur.y - need >= BOTTOM) return;
    cur.page = doc.addPage([A4.width, A4.height]);
    cur.y = A4.height - M;
  };
  const write = (text: string, { size = 9.5, font = fonts.regular, gap = 3, color = INK, indent = 0 } = {}) => {
    for (const line of wrap(text, font, size, CONTENT - indent)) {
      room(size + gap);
      cur.page.drawText(line, { x: M + indent, y: cur.y - size, size, font, color });
      cur.y -= size + gap;
    }
  };
  const space = (h: number) => {
    room(h);
    cur.y -= h;
  };
  const rule = () => {
    room(12);
    cur.page.drawLine({ start: { x: M, y: cur.y - 6 }, end: { x: A4.width - M, y: cur.y - 6 }, thickness: 0.6, color: LINE });
    cur.y -= 14;
  };

  /* ---------- En-tête ---------- */
  write("CONTRAT DE COLLABORATION MON VRAI", { size: 15, font: fonts.bold, gap: 6 });
  write(`${signature.contractName} — version ${signature.contractVersion}`, { size: 9, color: MUTED, gap: 2 });
  write(`Référence ${signature.id}`, { size: 9, color: MUTED });
  rule();

  /* ---------- Les parties, en clair avant le texte ---------- */
  write("Le créateur", { size: 10, font: fonts.bold, gap: 4 });
  write(`${signature.firstName} ${signature.lastName}`);
  write(oneLineAddress(signature.address));
  if (signature.email) write(signature.email);
  write(`Résidence fiscale : ${signature.taxCountry}`);
  write(
    `Qualité : ${signature.status === "individual" ? "particulier" : signature.status === "sole_trader" ? "micro-entrepreneur" : "société"}` +
      (signature.companyName ? ` - ${signature.companyName}` : "") +
      (signature.siret ? ` - SIRET ${signature.siret}` : ""),
  );
  space(6);

  write("Produits remis", { size: 10, font: fonts.bold, gap: 4 });
  for (const p of signature.products) write(`${p.title}${p.qty > 1 ? ` × ${p.qty}` : ""} — ${formatEuro(p.unitValue * p.qty)}`, { indent: 8 });
  write(`Valeur totale de l'avantage en nature : ${formatEuro(signature.totalValue)}`, { font: fonts.bold });
  rule();

  /* ---------- Le contrat, tel qu'il a été lu ---------- */
  for (const raw of signature.bodySnapshot.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      space(4);
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      rule();
    } else if (line.startsWith("## ")) {
      space(6);
      write(line.slice(3).replace(/\*\*/g, ""), { size: 11, font: fonts.bold, gap: 4 });
    } else if (line.startsWith("# ")) {
      space(8);
      write(line.slice(2).replace(/\*\*/g, ""), { size: 13, font: fonts.bold, gap: 5 });
    } else if (/^\*\s+/.test(line)) {
      write(`• ${line.replace(/^\*\s+/, "").replace(/\*\*/g, "")}`, { indent: 10 });
    } else {
      write(line.replace(/\*\*/g, ""));
    }
  }

  /* ---------- L'acceptation ferme le document ---------- */
  space(10);
  rule();
  write("Accepté électroniquement par", { size: 9, color: MUTED, gap: 2 });
  write(signature.signerTypedName, { size: 12, font: fonts.bold, gap: 4 });
  write(`Le ${new Date(signature.acceptedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" })}`);
  write(`Référence du contrat : ${signature.id}`);
  write(`Empreinte SHA-256 : ${signature.contractHash}`, { size: 7.5, color: MUTED });

  return Buffer.from(await doc.save());
}
