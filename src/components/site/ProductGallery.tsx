"use client";

import Image from "next/image";
import { useState } from "react";
import type { ImageRef, Tint } from "@/lib/domain/types";
import { TINT_BG } from "./ui";

/*
 * Galerie de la fiche produit (maquette 9a) : la grande image sur le fond teinté du
 * livre, les vignettes en dessous ; un clic change l'image. Les photos remplissent le
 * cadre (object-cover) ; le fond teinté ne se voit qu'en attendant le chargement.
 */
export function ProductGallery({ images, tint, badge, title }: { images: ImageRef[]; tint: Tint; badge: string | null; title: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative aspect-square overflow-hidden rounded-panel ${TINT_BG[tint]}`}>
        {current && <Image key={current.url} src={current.url} alt={current.alt || title} fill sizes="(min-width: 1100px) 640px, 100vw" priority className="object-cover" />}
        {badge && <span className="absolute left-5 top-5 rounded-pill bg-white px-3.5 py-2 text-xs font-bold">{badge}</span>}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2.5" role="tablist" aria-label="Photos du livre">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`relative aspect-square overflow-hidden rounded-thumb border-2 ${i === index ? "border-ink" : "border-transparent hover:border-line-warm"}`}
            >
              <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
