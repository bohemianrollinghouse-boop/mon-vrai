"use client";

import { useMemo, useState } from "react";
import { useMediaLibrary } from "@/lib/blocks/media-context";
import type { ImageRef } from "@/lib/domain/types";

/*
 * Champ « image » de l'éditeur de blocs : ouvre la médiathèque (/admin/medias) plutôt
 * que de demander une URL au clavier. La valeur stockée est un ImageRef — url, texte
 * alternatif et dimensions —, ce qui permet à next/image de réserver la place au
 * rendu public sans aller relire la fiche du média.
 *
 * Le texte alternatif est repris du média mais reste modifiable ici : la même image
 * ne se décrit pas pareil selon l'endroit où elle est posée.
 */

type Value = ImageRef | undefined;

export function MediaPickerField({ value, onChange, readOnly }: { value: Value; onChange: (v: Value) => void; readOnly?: boolean }) {
  const media = useMediaLibrary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const images = useMemo(() => media.filter((m) => m.mime.startsWith("image/")), [media]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return images;
    return images.filter((m) => m.path.toLowerCase().includes(q) || m.alt.toLowerCase().includes(q));
  }, [images, query]);

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
          Choisir une image…
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-6" onClick={() => setOpen(false)}>
          <div className="flex max-h-[80vh] w-full max-w-[52rem] flex-col gap-3 rounded-card bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">Médiathèque · {shown.length} image{shown.length > 1 ? "s" : ""}</strong>
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold underline">
                Fermer
              </button>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer par nom ou texte alternatif…"
              className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
            />
            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Aucune image. Envoyez-en depuis Médias.</p>
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
          </div>
        </div>
      )}
    </div>
  );
}
