import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDeliverable, openDeliverable } from "@/lib/db/deliverables";

/*
 * Un contenu rendu par un partenaire (photo, vidéo). Ces fichiers vivent dans un dossier
 * privé du coffre : ils ne sont servis qu'ici, et seulement à un administrateur. Aucune
 * mise en cache — ce sont des pièces de dossier, pas des images de la boutique.
 *
 * Servi EN FLUX, et par tranches quand le navigateur en demande une. Une vidéo de deux
 * cents mégaoctets lue d'un bloc tiendrait toute entière dans la mémoire de l'instance,
 * qui n'en a qu'un gigaoctet ; et un lecteur vidéo ne demande jamais le fichier entier —
 * il réclame de quoi commencer, puis la suite au fur et à mesure. Sans « Range », pas
 * d'avance rapide : le lecteur ne sait plus sauter.
 */

/** `bytes=0-1023`, borné à la taille réelle. Null si l'entête ne dit rien d'utilisable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  if (!m || size <= 0) return null;
  const [, rawStart, rawEnd] = m;
  /* `bytes=-500` : les 500 derniers octets. */
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd || size));
  const end = rawStart ? Math.min(size - 1, rawEnd ? Number(rawEnd) : size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await ctx.params;
  const doc = await getDeliverable(id);
  if (!doc) return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });

  const range = parseRange(request.headers.get("range"), doc.size);
  const opened = await openDeliverable(id, range ?? undefined);
  if (!opened) return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });

  const length = range ? range.end - range.start + 1 : doc.size;
  return new NextResponse(Readable.toWeb(opened.stream as Readable) as unknown as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      "content-type": doc.mime,
      "content-length": String(length),
      "accept-ranges": "bytes",
      ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${doc.size}` } : {}),
      /* Un HEIC ne s'affiche dans aucun navigateur : autant le proposer au téléchargement
         plutôt que d'ouvrir un onglet vide. */
      "content-disposition": `${doc.mime === "image/heic" || doc.mime === "image/heif" ? "attachment" : "inline"}; filename="${doc.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
