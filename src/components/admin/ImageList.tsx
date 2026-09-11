"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageRef } from "@/lib/domain/types";

/*
 * Photos d'un produit, comme dans la maquette : la principale en grand sur la teinte
 * du livre, les autres en vignettes, une case « + » pour ajouter. Réordonner, retirer,
 * corriger le texte alternatif.
 *
 * Une photo choisie s'affiche immédiatement, avant tout envoi : on la lit dans le
 * navigateur (URL d'objet) et on la traite comme les autres — on peut la déplacer, la
 * retirer, lui donner un texte alternatif. Elle n'est envoyée qu'à l'enregistrement.
 *
 * L'état part dans `imagesJson` (photos déjà en ligne, dans l'ordre voulu) et dans
 * l'<input type="file" name="newImages"> pour les nouvelles. Cet input ne sait pas
 * cumuler deux sélections successives ni en retirer une : on réécrit donc sa liste de
 * fichiers à chaque changement, via un DataTransfer.
 */
const TINT_BG = { green: "bg-tint-green", blue: "bg-tint-blue", pink: "bg-tint-pink", sand: "bg-tint-sand" } as const;

/** Une photo de la liste : déjà en ligne, ou choisie et pas encore envoyée. */
type Item = { url: string; alt: string; width?: number; height?: number; file?: File };

export function ImageList({ initial, tint = "sand" }: { initial: ImageRef[]; tint?: keyof typeof TINT_BG }) {
  const [images, setImages] = useState<Item[]>(initial);
  const [selected, setSelected] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  // Les URL d'objet vivent tant que le composant est monté ; on les libère en sortant.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /* L'input ne retient qu'une sélection : on lui réécrit la liste complète. */
  const syncFiles = (next: Item[]) => {
    const input = fileInput.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const it of next) if (it.file) dt.items.add(it.file);
    input.files = dt.files;
  };

  const update = (next: Item[], nextSelected = selected) => {
    setImages(next);
    setSelected(Math.max(0, Math.min(nextSelected, next.length - 1)));
    syncFiles(next);
  };

  const add = (files: FileList | null) => {
    const chosen = Array.from(files ?? []);
    if (chosen.length === 0) return;
    const added: Item[] = chosen.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      return { url, alt: "", file };
    });
    const next = [...images, ...added];
    update(next, images.length);
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const copy = [...images];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    update(copy, j);
  };

  const remove = (i: number) => {
    const gone = images[i];
    if (gone?.file) {
      URL.revokeObjectURL(gone.url);
      objectUrls.current = objectUrls.current.filter((u) => u !== gone.url);
    }
    update(images.filter((_, k) => k !== i), 0);
  };

  const main = images[selected] ?? images[0];
  const pendingCount = images.filter((i) => i.file).length;
  // Seules les photos déjà en ligne partent en JSON ; les nouvelles partent en fichiers.
  const kept = images.filter((i) => !i.file).map(({ url, alt, width, height }) => ({ url, alt, width, height }));

  return (
    <div className="flex flex-col gap-3.5">
      <input type="hidden" name="imagesJson" value={JSON.stringify(kept)} readOnly />

      <div className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl ${TINT_BG[tint]}`}>
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu admin
          <img src={main.url} alt={main.alt} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[0.8125rem] font-semibold text-subtle">Aucune photo</span>
        )}
        {main && (
          <>
            <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
              <span className="rounded-pill bg-surface px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.08em]">
                {selected === 0 ? "Principale" : `Photo ${selected + 1}`}
              </span>
              {main.file && (
                <span className="rounded-pill bg-tint-sand px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-tint-sand-ink">
                  À envoyer
                </span>
              )}
            </span>
            <div className="absolute bottom-2.5 right-2.5 flex gap-1.5">
              {selected > 0 && (
                <button type="button" onClick={() => move(selected, -1)} className="rounded-pill bg-surface px-2.5 py-1.5 text-[0.6875rem] font-bold">
                  ← Avancer
                </button>
              )}
              {selected < images.length - 1 && (
                <button type="button" onClick={() => move(selected, 1)} className="rounded-pill bg-surface px-2.5 py-1.5 text-[0.6875rem] font-bold">
                  Reculer →
                </button>
              )}
              <button type="button" onClick={() => remove(selected)} className="rounded-pill bg-surface px-2.5 py-1.5 text-[0.6875rem] font-bold text-accent">
                Retirer
              </button>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setSelected(i)}
            aria-label={`Photo ${i + 1}${img.file ? " (à envoyer)" : ""}`}
            aria-pressed={i === selected}
            className={`relative aspect-square overflow-hidden rounded-xl ${i === selected ? "outline-2 outline-offset-2 outline-ink" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin */}
            <img src={img.url} alt="" className="h-full w-full object-cover" />
            {img.file && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-white">À envoyer</span>}
          </button>
        ))}
        <label className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-line-warm text-xl text-faint hover:border-ink hover:text-ink" title="Ajouter des photos">
          +
          <input
            ref={fileInput}
            type="file"
            name="newImages"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={(e) => add(e.target.files)}
          />
        </label>
      </div>

      {main && (
        <input
          value={main.alt}
          onChange={(e) => update(images.map((x, k) => (k === selected ? { ...x, alt: e.target.value } : x)))}
          placeholder="Texte alternatif de la photo sélectionnée"
          aria-label="Texte alternatif"
          className="w-full rounded-[14px] bg-paper px-4 py-3 text-[0.8125rem] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
        />
      )}
      {pendingCount > 0 && (
        <span className="text-xs font-semibold text-tint-green-ink">
          {pendingCount} photo{pendingCount > 1 ? "s" : ""} sera{pendingCount > 1 ? "ont" : ""} envoyée{pendingCount > 1 ? "s" : ""} à l'enregistrement.
        </span>
      )}
      <span className="text-[0.6875rem] leading-relaxed text-subtle">La première photo est la vignette. JPG, PNG, WebP ou AVIF, 40 Mo max. Fond de vignette : la teinte du livre.</span>
    </div>
  );
}
