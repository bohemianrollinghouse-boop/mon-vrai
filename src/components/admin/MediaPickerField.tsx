"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { uploadMediaFilesAction } from "@/lib/admin/actions/media";
import { useMediaLibrary } from "@/lib/blocks/media-context";
import type { ImageRef } from "@/lib/domain/types";

/*
 * Champ « image » de l'éditeur de blocs : ouvre la médiathèque (/admin/medias) plutôt
 * que de demander une URL au clavier. La valeur stockée est un ImageRef — url, texte
 * alternatif et dimensions —, ce qui permet à next/image de réserver la place au
 * rendu public sans aller relire la fiche du média.
 *
 * On importe aussi depuis ici, par le bouton ou en déposant les fichiers : sortir de
 * l'éditeur pour envoyer une photo, puis y revenir pour la choisir, faisait perdre le
 * fil de la page en cours. Le fichier envoyé est choisi dans la foulée.
 *
 * Le texte alternatif est repris du média mais reste modifiable ici : la même image
 * ne se décrit pas pareil selon l'endroit où elle est posée.
 */

type Value = ImageRef | undefined;

/*
 * Ce que le champ cherche : une image, ou une vidéo.
 *
 * Un champ « Vidéo de fond » qui ne proposait que des photos n'était pas un manque de
 * confort : c'était une impasse — la vidéo du héro d'accueil ne pouvait pas se changer
 * depuis l'éditeur, alors que c'est précisément ce que le champ annonce. La nature
 * cherchée se déclare donc, et elle commande tout ce qui en dépend : ce qu'on liste, ce
 * qu'on accepte à l'envoi, et la façon d'en montrer une vignette.
 */
export type MediaKind = "image" | "video";

/*
 * Formats réellement acceptés par la médiathèque (voir ALLOWED dans db/media.ts). On
 * ne met pas `image/*` : la photothèque d'un iPhone proposerait alors des HEIC, que le
 * serveur refuse ensuite — mieux vaut ne pas les laisser choisir.
 *
 * `video/quicktime` est de la partie pour la même raison qu'il l'est dans la
 * médiathèque : un `.mov` d'iPhone contient presque toujours de l'H.264, et il est
 * rebaptisé en entrant (domain/media-compat.ts) plutôt que transcodé.
 */
const ACCEPTED: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"],
};

const WORDS: Record<MediaKind, { one: string; many: string; choose: string; send: string; refused: string; formats: string; none: string }> = {
  image: {
    one: "image",
    many: "images",
    choose: "Choisir ou importer une image…",
    send: "Importer une image",
    refused: "Format non accepté : envoyez du JPG, PNG, WebP ou AVIF.",
    formats: "JPG, PNG, WebP ou AVIF, 40 Mo maximum. Les fichiers envoyés rejoignent la médiathèque.",
    none: "Aucune image. Importez-en ci-dessus, ou déposez un fichier ici.",
  },
  video: {
    one: "vidéo",
    many: "vidéos",
    choose: "Choisir ou importer une vidéo…",
    send: "Importer une vidéo",
    refused: "Format non accepté : envoyez du MP4, WebM ou MOV.",
    formats: "MP4, WebM ou MOV, 40 Mo maximum. Une vidéo lourde passe mieux par /admin/medias.",
    none: "Aucune vidéo dans la médiathèque. Importez-en ci-dessus, ou déposez un fichier ici.",
  },
};

/*
 * La vignette d'un média, quelle que soit sa nature.
 *
 * Une vidéo n'a pas de miniature en base : on demande au navigateur la seule chose
 * qu'il sache donner sans tout télécharger — les métadonnées et l'image à un dixième de
 * seconde (`#t=0.1`). C'est déjà ce que fait le sélecteur du guide
 * (components/admin/MediaChoice), et pour la même raison.
 */
function Vignette({ src, kind, alt = "", className = "" }: { src: string; kind: MediaKind; alt?: string; className?: string }) {
  if (kind === "video") {
    return <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className={`bg-ink object-cover ${className}`} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- vignette admin
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}

export function MediaPickerField({ value, onChange, readOnly, kind = "image" }: { value: Value; onChange: (v: Value) => void; readOnly?: boolean; kind?: MediaKind }) {
  const { media, add } = useMediaLibrary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const words = WORDS[kind];
  const accepted = ACCEPTED[kind];
  const accept = accepted.join(",");

  const candidates = useMemo(() => media.filter((m) => m.mime.startsWith(`${kind}/`)), [media, kind]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((m) => m.path.toLowerCase().includes(q) || m.alt.toLowerCase().includes(q));
  }, [candidates, query]);

  async function upload(files: FileList | File[] | null) {
    const all = Array.from(files ?? []);
    const chosen = all.filter((f) => accepted.includes(f.type));
    if (chosen.length === 0) {
      setError(all.length ? words.refused : "Aucun fichier à envoyer.");
      return;
    }
    setBusy(true);
    setError("");
    const body = new FormData();
    for (const f of chosen) body.append("files", f);

    const result = await uploadMediaFilesAction(body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    add(result.media);
    /* Un fichier refusé sur plusieurs : on garde la fenêtre ouverte pour le dire. */
    if (result.error) setError(result.error);
    /* Le premier envoi devient le média du bloc : c'est ce qu'on venait faire. */
    const first = result.media[0];
    if (first) {
      onChange({ url: first.url, alt: value?.alt || first.alt, width: first.width, height: first.height });
      if (!result.error) setOpen(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files);
  }

  if (readOnly) {
    return <div className="text-xs text-subtle">{value?.url ? `${kind === "video" ? "Vidéo" : "Image"} définie` : `Aucune ${words.one}`}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {value?.url ? (
        <div className="flex items-start gap-3 rounded-[12px] bg-paper p-2">
          <Vignette src={value.url} kind={kind} className="h-16 w-16 shrink-0 rounded-[8px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* Une vidéo de fond n'est pas décrite : le héro ne rend aucun texte de
                remplacement pour elle, et proposer un champ qui ne sert à rien
                reviendrait à promettre qu'il sert. */}
            {kind === "image" && (
              <input
                value={value.alt}
                onChange={(e) => onChange({ ...value, alt: e.target.value })}
                placeholder="Texte alternatif"
                className="w-full rounded-[8px] border border-line bg-surface px-2 py-1.5 text-xs"
              />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(true)} className="text-[0.6875rem] font-bold underline">
                Changer
              </button>
              <button type="button" onClick={() => onChange(undefined)} className="text-[0.6875rem] font-bold text-danger underline">
                Retirer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-[12px] border border-dashed border-line bg-paper px-3 py-6 text-xs font-bold text-subtle hover:opacity-70">
          {words.choose}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-6" onClick={() => setOpen(false)}>
          <div
            className={`flex max-h-[80vh] w-full max-w-[52rem] flex-col gap-3 rounded-card bg-surface p-5 ${dragging ? "outline-2 outline-dashed outline-ink" : ""}`}
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">Médiathèque · {shown.length} {shown.length > 1 ? words.many : words.one}</strong>
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold underline">
                Fermer
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer par nom ou texte alternatif…"
                className="min-w-[12rem] flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
              />
              <input
                ref={fileInput}
                type="file"
                accept={accept}
                multiple
                className="sr-only"
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="rounded-[10px] bg-ink px-3.5 py-2 text-xs font-bold text-on-ink hover:opacity-80 disabled:opacity-50"
              >
                {busy ? "Envoi…" : words.send}
              </button>
            </div>

            {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            {dragging && <p className="text-xs font-semibold text-subtle">Déposez les fichiers pour les envoyer.</p>}

            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{words.none}</p>
            ) : (
              /*
                `min-h-0` et `flex-1` : sans eux, un enfant de colonne flex ne descend
                jamais sous la hauteur de son contenu (`min-height: auto`), le défilement
                ne s'enclenche pas, et c'est la grille qui se comprime — les vignettes
                rapetissaient à mesure que la médiathèque grossissait. `content-start`
                et `auto-rows-max` empêchent en plus les rangées de s'étirer.
              */
              <div className="grid min-h-0 flex-1 auto-rows-max content-start grid-cols-5 gap-2 overflow-y-auto max-[899px]:grid-cols-3">
                {shown.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.path}
                    onClick={() => {
                      onChange({ url: m.url, alt: value?.alt || m.alt, width: m.width, height: m.height });
                      setOpen(false);
                    }}
                    className={`aspect-square overflow-hidden rounded-[10px] bg-paper ring-offset-2 hover:opacity-80 ${value?.url === m.url ? "ring-2 ring-ink" : ""}`}
                  >
                    <Vignette src={m.url} kind={kind} alt={m.alt} className="h-full w-full" />
                  </button>
                ))}
              </div>
            )}

            <p className="text-[0.6875rem] text-subtle">{words.formats}</p>
          </div>
        </div>
      )}
    </div>
  );
}
