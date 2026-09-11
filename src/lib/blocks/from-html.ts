/*
 * Conversion d'un corps HTML figé (l'ancien éditeur de texte riche) en blocs. Le
 * découpage suit les titres : chaque <h1>/<h2>/<h3> devient un bloc « Titre », et ce
 * qui les sépare un bloc « Texte ». On obtient une page structurée, éditable section
 * par section, plutôt qu'un unique pavé de HTML.
 *
 * Fonction pure, sans accès aux données : elle est testée (from-html.test.ts).
 */

import type { BlockDocument } from "@/lib/domain/types";

export type SimpleBlock = { type: "Titre" | "Texte"; props: Record<string, unknown> };

const HEADING = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

/** Texte brut d'un fragment HTML, pour comparer des titres et repérer le vide. */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Un fragment ne portant ni texte ni image ne mérite pas de bloc. */
function isEmpty(html: string): boolean {
  return plain(html) === "" && !/<(img|iframe|video)\b/i.test(html);
}

/**
 * @param html   Le corps figé à découper.
 * @param dropTitle Titre de la page : un titre de tête identique est retiré, la page
 *                  l'affiche déjà par ailleurs.
 */
export function htmlToBlocks(html: string, dropTitle?: string): SimpleBlock[] {
  const blocks: SimpleBlock[] = [];
  let cursor = 0;

  const pushText = (fragment: string) => {
    if (isEmpty(fragment)) return;
    blocks.push({ type: "Texte", props: { contenu: fragment.trim() } });
  };

  HEADING.lastIndex = 0;
  for (let m = HEADING.exec(html); m; m = HEADING.exec(html)) {
    pushText(html.slice(cursor, m.index));
    const label = plain(m[2]);
    if (label) {
      const first = blocks.length === 0;
      const duplicate = first && dropTitle !== undefined && label.toLowerCase() === plain(dropTitle).toLowerCase();
      if (!duplicate) {
        blocks.push({ type: "Titre", props: { texte: label, niveau: m[1] === "3" ? "3" : "2", surtitre: "", alignement: "left" } });
      }
    }
    cursor = m.index + m[0].length;
  }
  pushText(html.slice(cursor));

  return blocks;
}

/*
 * Document de blocs prêt à être édité, à partir d'un corps de texte riche. Sert à
 * reprendre une page rédigée avant l'éditeur de blocs : elle s'ouvre déjà découpée,
 * et rien n'est réécrit en base tant que l'auteur n'a pas enregistré.
 *
 * Les identifiants sont dérivés du rang, donc stables d'un appel à l'autre : rouvrir
 * la page sans l'enregistrer ne fabrique pas un document différent.
 */
export function htmlToDocument(html: string, title?: string): BlockDocument {
  return {
    root: { props: {} },
    content: htmlToBlocks(html, title).map((b, i) => ({ type: b.type, props: { id: `${b.type}-${i + 1}`, ...b.props } })),
  };
}

/*
 * Page légale : le contenu découpé, posé dans le gabarit 7c (fil d'Ariane, titre,
 * sommaire des pages sœurs à gauche, panneau blanc à droite). Le sommaire n'est pas
 * dans le document : il se déduit de la colonne de pied au rendu.
 */
export function legalToDocument(html: string, title: string, resume = ""): BlockDocument {
  const inner = htmlToBlocks(html, title).map((b, i) => ({ type: b.type, props: { id: `${b.type}-${i + 1}`, ...b.props } }));
  return {
    root: { props: {} },
    content: [
      {
        type: "GabaritLegal",
        props: {
          id: "GabaritLegal-1",
          resume,
          aideTitre: "Une question ?",
          aideTexte: "Nous répondons sous 48 h ouvrées.",
          aideCtaLabel: "Nous contacter",
          aideCtaHref: "/contact",
          contenu: inner,
        },
      },
    ],
  };
}
