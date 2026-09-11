import type { Media } from "@/lib/domain/types";

/** Résultat commun à toutes les actions serveur de l'admin, consommé par <ActionForm>. */
export type AdminResult =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; error: string; issues?: Record<string, string> };

/*
 * Envoi de fichiers depuis un sélecteur d'image, par opposition au formulaire de la
 * médiathèque : l'appelant a besoin des fiches créées pour les afficher et en choisir
 * une sans recharger la page. D'où un résultat qui porte les médias, et non un simple
 * message.
 */
export type MediaUploadResult =
  /** `error` est présent quand une partie seulement des fichiers est passée. */
  | { ok: true; media: Media[]; error?: string }
  | { ok: false; error: string };

export const saved = (message = "Enregistré."): AdminResult => ({ ok: true, message });
export const failed = (error: string, issues?: Record<string, string>): AdminResult => ({ ok: false, error, issues });
