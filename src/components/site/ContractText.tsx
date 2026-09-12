import type { ReactNode } from "react";

/*
 * Rendu d'un contrat. Le texte s'écrit dans l'admin avec une mise en forme minimale —
 * `#` et `##` pour les titres, `**gras**`, `*` en début de ligne pour les puces — et se
 * lit ici comme un document. Pas de bibliothèque markdown : ces quatre règles suffisent,
 * et un contrat n'a pas à accepter du HTML venu d'ailleurs.
 *
 * Le composant ne porte ni fond ni cadre : c'est l'appelant qui décide où il vit — dans
 * la fenêtre de signature, dans l'aperçu de l'admin, plus tard dans un PDF.
 */

/** Découpe `**gras**` sans jamais interpréter de HTML. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${keyPrefix}-${i}`} className="font-bold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  );
}

export function ContractText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="flex flex-col gap-1 pl-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="text-subtle">
              ·
            </span>
            <span>{inline(b, `b${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^\*\s+/.test(line)) {
      bullets.push(line.replace(/^\*\s+/, ""));
      continue;
    }
    flush();
    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-1 border-line" />);
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-3 text-sm font-extrabold tracking-[-0.01em]">
          {inline(line.slice(3), `h${blocks.length}`)}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-3 text-base font-extrabold tracking-[-0.01em]">
          {inline(line.slice(2), `h${blocks.length}`)}
        </h2>,
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="leading-relaxed">
          {inline(line, `p${blocks.length}`)}
        </p>,
      );
    }
  }
  flush();

  return <div className={`flex flex-col gap-2 text-[0.8125rem] text-[#333] ${className}`}>{blocks}</div>;
}
