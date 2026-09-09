"use client";

import { useState } from "react";
import type { ImageRef } from "@/lib/domain/types";

/*
 * Photos d'un produit, comme dans la maquette : la principale en grand sur la teinte
 * du livre, les autres en vignettes, une case « + » pour ajouter. Réordonner, retirer,
 * corriger le texte alternatif. L'état est sérialisé dans `imagesJson` ; les nouveaux
 * fichiers passent par l'<input type="file" name="newImages">.
 */
const TINT_BG = { green: "bg-tint-green", blue: "bg-tint-blue", pink: "bg-tint-pink", sand: "bg-tint-sand" } as const;

export function ImageList({ initial, tint = "sand" }: { initial: ImageRef[]; tint?: keyof typeof TINT_BG }) {
  const [images, setImages] = useState<ImageRef[]>(initial);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<string[]>([]);
  const main = images[selected] ?? images[0];

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const copy = [...images];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setImages(copy);
    setSelected(j);
  };
  const remove = (i: number) => {
    setImages(images.filter((_, k) => k !== i));
    setSelected(0);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <input type="hidden" name="imagesJson" value={JSON.stringify(images)} readOnly />

      <div className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl ${TINT_BG[tint]}`}>
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu admin
          <img src={main.url} alt={main.alt} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[0.8125rem] font-semibold text-subtle">Aucune photo</span>
        )}
        {main && (
          <>
            <span className="absolute left-2.5 top-2.5 rounded-pill bg-surface px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.08em]">{selected === 0 ? "Principale" : `Photo ${selected + 1}`}</span>
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
            aria-label={`Photo ${i + 1}`}
            aria-pressed={i === selected}
            className={`aspect-square overflow-hidden rounded-xl ${i === selected ? "outline-2 outline-offset-2 outline-ink" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin */}
            <img src={img.url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        <label className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-line-warm text-xl text-faint hover:border-ink hover:text-ink" title="Ajouter des photos">
          +
          <input type="file" name="newImages" multiple accept="image/*" className="sr-only" onChange={(e) => setPending(Array.from(e.target.files ?? []).map((f) => f.name))} />
        </label>
      </div>

      {main && (
        <input
          value={main.alt}
          onChange={(e) => setImages(images.map((x, k) => (k === selected ? { ...x, alt: e.target.value } : x)))}
          placeholder="Texte alternatif de la photo sélectionnée"
          aria-label="Texte alternatif"
          className="w-full rounded-[14px] bg-paper px-4 py-3 text-[0.8125rem] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
        />
      )}
      {pending.length > 0 && <span className="text-xs font-semibold text-tint-green-ink">{pending.length} photo{pending.length > 1 ? "s" : ""} à envoyer à l'enregistrement : {pending.join(", ")}</span>}
      <span className="text-[0.6875rem] leading-relaxed text-subtle">La première photo est la vignette. JPG, PNG, WebP ou AVIF, 40 Mo max. Fond de vignette : la teinte du livre.</span>
    </div>
  );
}
