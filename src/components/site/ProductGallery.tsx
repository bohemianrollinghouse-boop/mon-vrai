"use client";

import Image from "next/image";
import { useState } from "react";
import type { ImageRef, Tint } from "@/lib/domain/types";
import { TINT_BG } from "./ui";

/*
 * Galerie de la fiche produit (maquette 9a) : la grande image sur le fond teinté, les
 * vignettes en dessous ; un clic change l'image. La première photo est le livre isolé
 * (affiché à 56 %, avec son ombre), les suivantes des photos d'ambiance (plein cadre).
 */
export function ProductGallery({ images, tint, badge, title }: { images: ImageRef[]; tint: Tint; badge: string | null; title: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];
  const isBookShot = index === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-panel ${TINT_BG[tint]}`}>
        {current &&
          (isBookShot ? (
            <Image
              key={current.url}
              src={current.url}
              alt={current.alt || title}
              width={current.width ?? 900}
              height={current.height ?? 1200}
              sizes="(min-width: 1100px) 640px, 100vw"
              priority
              className="h-auto max-h-[80%] w-auto max-w-[56%] rounded-[10px] shadow-[0_24px_50px_rgb(0_0_0/0.18)]"
            />
          ) : (
            <Image key={current.url} src={current.url} alt={current.alt || title} fill sizes="(min-width: 1100px) 640px, 100vw" className="object-cover" />
          ))}
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
              className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-thumb border-2 bg-white ${i === index ? "border-ink" : "border-transparent hover:border-line-warm"}`}
            >
              {i === 0 ? (
                <Image src={img.url} alt="" width={img.width ?? 300} height={img.height ?? 400} sizes="120px" className="h-auto max-h-[80%] w-auto max-w-[60%] rounded-[4px]" />
              ) : (
                <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
