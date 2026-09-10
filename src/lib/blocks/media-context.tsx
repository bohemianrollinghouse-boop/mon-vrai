"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Media } from "@/lib/domain/types";

/*
 * La médiathèque, chargée une fois côté serveur et posée autour de <Puck>. Un champ
 * personnalisé de Puck ne reçoit ni `metadata` ni props de l'hôte : le contexte est
 * la seule prise propre pour lui donner la liste des fichiers.
 */

const MediaLibrary = createContext<Media[]>([]);

export function MediaLibraryProvider({ media, children }: { media: Media[]; children: ReactNode }) {
  return <MediaLibrary.Provider value={media}>{children}</MediaLibrary.Provider>;
}

export function useMediaLibrary(): Media[] {
  return useContext(MediaLibrary);
}
