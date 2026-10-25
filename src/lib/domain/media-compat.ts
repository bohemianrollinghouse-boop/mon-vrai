/*
 * Faire marcher les vidéos d'iPhone sur le web.
 *
 * Un téléphone filme en `.mov`, et annonce `video/quicktime`. Dans l'immense majorité
 * des cas, ce qu'il y a DEDANS est de l'H.264 dans un conteneur ISO — exactement ce
 * qu'un `.mp4` contient. Seule l'étiquette diffère, et c'est elle qui bloque : Chrome et
 * Firefox refusent d'essayer un type qu'ils ne reconnaissent pas, alors qu'ils liraient
 * le fichier sans broncher.
 *
 * On REBAPTISE donc la vidéo au moment où elle rejoint la médiathèque — celle qui est
 * destinée à paraître sur le site. Les octets ne changent pas d'un bit : on corrige une
 * étiquette, on ne transcode rien, et rien ne serait moins raisonnable que de faire
 * tourner un encodeur vidéo dans une requête web.
 *
 * Ce que cela ne sauve PAS, et qu'il faut dire : une vidéo encodée en HEVC (H.265), ce
 * que les iPhone font en mode « Haute efficacité », ne se lira ni sur Chrome ni sur
 * Firefox quel que soit son nom. Le remède est sur le téléphone — Réglages → Appareil
 * photo → Formats → « Plus compatible » —, pas ici.
 *
 * La pièce privée du dossier de campagne, elle, garde son type véritable : on n'y
 * arrange rien pour un navigateur, on y conserve ce qu'on a reçu.
 */

/** Les conteneurs qu'un navigateur lit, mais sous un autre nom. */
const RENAMED: Record<string, string> = {
  "video/quicktime": "video/mp4",
  "video/x-m4v": "video/mp4",
};

/** Le type sous lequel servir un fichier pour qu'un navigateur accepte de l'essayer. */
export const playableMime = (mime: string): string => RENAMED[mime] ?? mime;

/** A-t-il fallu le rebaptiser ? L'écran le dit, parce que la lecture n'est pas garantie. */
export const wasRenamed = (mime: string): boolean => mime in RENAMED;
