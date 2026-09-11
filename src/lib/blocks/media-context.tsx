"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Media } from "@/lib/domain/types";

/*
 * La médiathèque, chargée une fois côté serveur et posée autour de <Puck>. Un champ
 * personnalisé de Puck ne reçoit ni `metadata` ni props de l'hôte : le contexte est
 * la seule prise propre pour lui donner la liste des fichiers.
 *
 * Elle est tenue en état, et non figée : un fichier envoyé depuis le sélecteur doit
 * apparaître tout de suite dans la grille. La liste du serveur ne repassera qu'au
 * prochain rendu de la page, bien après le choix de l'image.
 */

type Library = { media: Media[]; add: (created: Media[]) => void };

const MediaLibrary = createContext<Library>({ media: [], add: () => {} });

export function MediaLibraryProvider({ media, children }: { media: Media[]; children: ReactNode }) {
  const [added, setAdded] = useState<Media[]>([]);

  const add = useCallback((created: Media[]) => {
    setAdded((prev) => [...created, ...prev]);
  }, []);

  /* Les envois de la session passent devant : c'est ce qu'on vient de choisir. */
  const value = useMemo<Library>(() => ({ media: [...added, ...media], add }), [added, media, add]);

  return <MediaLibrary.Provider value={value}>{children}</MediaLibrary.Provider>;
}

export function useMediaLibrary(): Library {
  return useContext(MediaLibrary);
}
