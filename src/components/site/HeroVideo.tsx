"use client";

/*
 * Vidéo d'accueil, sans affiche pour l'instant : le JPEG de l'affiche se dessinait de
 * haut en bas (non progressif) et faisait pire que mieux. La vidéo est légère
 * (1600 px, muette, faststart) : son premier plan s'affiche dès qu'il est décodé.
 * Le fond sable du conteneur évite un trou blanc pendant ce court instant.
 */
export function HeroVideo({ videoUrl }: { videoUrl: string }) {
  return (
    <video
      src={videoUrl}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
    />
  );
}
