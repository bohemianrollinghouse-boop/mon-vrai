"use client";

import Image from "next/image";
import { useState } from "react";

/*
 * Vidéo d'accueil sans à-coup : l'affiche (première image de la vidéo, pleine
 * résolution) s'affiche immédiatement et reste visible sous la vidéo, qui n'apparaît
 * qu'une fois qu'elle joue réellement — en fondu, sur une image identique. Sans
 * JavaScript ou si l'animation est réduite, on ne voit que l'affiche.
 */
export function HeroVideo({ videoUrl, posterUrl }: { videoUrl: string; posterUrl?: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <>
      {posterUrl && <Image src={posterUrl} alt="" fill sizes="(min-width: 1296px) 1200px, 100vw" className="object-cover" priority />}
      <video
        src={videoUrl}
        poster={posterUrl || undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        onPlaying={() => setPlaying(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:hidden ${playing ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}
