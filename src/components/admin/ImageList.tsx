"use client";

import { useState } from "react";
import type { ImageRef } from "@/lib/domain/types";
import { Button, Input } from "./ui";

/*
 * Liste d'images d'un produit : réordonner, retirer, corriger le texte alternatif.
 * L'état est sérialisé dans un champ caché `imagesJson` ; les nouveaux fichiers
 * passent par un <input type="file" name="newImages" multiple> à côté.
 */
export function ImageList({ initial }: { initial: ImageRef[] }) {
  const [images, setImages] = useState<ImageRef[]>(initial);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const copy = [...images];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setImages(copy);
  };

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="imagesJson" value={JSON.stringify(images)} readOnly />
      {images.length === 0 && <p className="text-sm text-muted">Aucune image pour l'instant.</p>}
      {images.map((img, i) => (
        <div key={img.url} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-xl bg-paper p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin, pas de besoin d'optimisation */}
          <img src={img.url} alt="" className="h-[72px] w-[72px] rounded-lg object-cover" />
          <Input value={img.alt} onChange={(e) => setImages(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))} placeholder="Texte alternatif" aria-label="Texte alternatif" />
          <div className="flex gap-1">
            <Button type="button" tone="secondary" onClick={() => move(i, -1)} className="px-2.5" aria-label="Monter">↑</Button>
            <Button type="button" tone="secondary" onClick={() => move(i, 1)} className="px-2.5" aria-label="Descendre">↓</Button>
            <Button type="button" tone="danger" onClick={() => setImages(images.filter((_, k) => k !== i))} className="px-2.5" aria-label="Retirer">×</Button>
          </div>
        </div>
      ))}
      <label className="flex flex-col gap-1.5 text-[0.8125rem] font-bold">
        Ajouter des images
        <input type="file" name="newImages" multiple accept="image/*" className="text-sm" />
        <span className="text-xs font-medium text-subtle">JPEG, PNG, WebP ou AVIF, 40 Mo max. La première image est la vignette.</span>
      </label>
    </div>
  );
}
