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

export function MediaPickerField({ value, onChange, readOnly }: { value: Value; onChange: (v: Value) => void; readOnly?: boolean }) {
  const { media, add } = useMediaLibrary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const images = useMemo(() => media.filter((m) => m.mime.startsWith("image/")), [media]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return images;
    return images.filter((m) => m.path.toLowerCase().includes(q) || m.alt.toLowerCase().includes(q));
  }, [images, query]);

  async function upload(files: FileList | File[] | null) {
    const chosen = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (chosen.length === 0) {
      setError("Seules les images peuvent être envoyées ici.");
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
    /* Le premier envoi devient la photo du bloc : c'est ce qu'on venait faire. */
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

  if (readOnly) return <div className="text-xs text-subtle">{value?.url ? "Image définie" : "Aucune image"}</div>;

  return (
    <div className="flex flex-col gap-2">
      {value?.url ? (
        <div className="flex items-start gap-3 rounded-[12px] bg-paper p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- vignette admin */}
          <img src={value.url} alt="" className="h-16 w-16 shrink-0 rounded-[8px] object-cover" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              value={value.alt}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
              placeholder="Texte alternatif"
              className="w-full rounded-[8px] border border-line bg-surface px-2 py-1.5 text-xs"
            />
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
          Choisir ou importer une image…
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
              <strong className="text-sm">Médiathèque · {shown.length} image{shown.length > 1 ? "s" : ""}</strong>
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
                accept="image/*"
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
                {busy ? "Envoi…" : "Importer une image"}
              </button>
            </div>

            {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            {dragging && <p className="text-xs font-semibold text-subtle">Déposez les fichiers pour les envoyer.</p>}

            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                Aucune image. Importez-en ci-dessus, ou déposez un fichier ici.
              </p>
            ) : (
              <div className="grid grid-cols-5 gap-2 overflow-y-auto max-[899px]:grid-cols-3">
                {shown.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.path}
                    onClick={() => {
                      onChange({ url: m.url, alt: value?.alt || m.alt, width: m.width, height: m.height });
                      setOpen(false);
                    }}
                    className={`overflow-hidden rounded-[10px] bg-paper ring-offset-2 hover:opacity-80 ${value?.url === m.url ? "ring-2 ring-ink" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- vignette admin */}
                    <img src={m.url} alt={m.alt} loading="lazy" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <p className="text-[0.6875rem] text-subtle">
              JPG, PNG, WebP ou AVIF, 40 Mo maximum. Les fichiers envoyés rejoignent la médiathèque.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
