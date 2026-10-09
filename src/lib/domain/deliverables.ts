import type { ContentQuota, DeliverableKind } from "./types";

/*
 * Les contenus qu'un partenaire rend : ce qu'on en attend, ce qui est arrivé, ce qui
 * manque.
 *
 * Tout est pur ici — rien de ce fichier ne lit la base ni le coffre. Le serveur, le
 * navigateur qui dépose et le contrat qui l'annonce s'en servent tous les trois, et
 * doivent dire exactement la même chose : le chemin où un fichier se dépose est le
 * chemin où le serveur va le relire, et le nombre que le contrat cite est le nombre
 * dont l'écran retranche.
 */

/*
 * Ce qu'on accepte. Plus large que la médiathèque, et volontairement : ces fichiers ne
 * paraissent nulle part sur le site, ils ne font que rejoindre le dossier d'une
 * campagne. Un HEIC d'iPhone ou un MOV, que la boutique refuse parce qu'aucun
 * navigateur ne les affiche, sont ici parfaitement légitimes — c'est ce que les
 * téléphones produisent.
 */
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
};

/** Ce qu'on propose dans le sélecteur de fichiers, extensions comprises. */
export const ACCEPTED_CONTENT = [...new Set(Object.values(EXT_MIME)), ...Object.keys(EXT_MIME).map((e) => `.${e}`)].join(",");

/*
 * Une vidéo verticale d'une minute pèse couramment 150 Mo, et une vidéo brute bien
 * davantage. Le plafond est donc haut : il n'est là que pour qu'un disque dur entier ne
 * parte pas dans le coffre par mégarde. Il est répété dans storage.rules, qui est le
 * seul à pouvoir le faire respecter avant l'envoi.
 */
export const MAX_CONTENT_BYTES = 500 * 1024 * 1024;

const extensionOf = (filename: string) => filename.toLowerCase().split(".").pop() ?? "";

/*
 * Le type réel d'un fichier. Windows annonce souvent un HEIC sans type du tout, et le
 * coffre le range alors en `application/octet-stream` : l'extension tranche quand
 * l'entête ne dit rien, et jamais l'inverse.
 */
export function contentMime(filename: string, declared: string): string {
  if (declared.startsWith("image/") || declared.startsWith("video/")) return declared;
  return EXT_MIME[extensionOf(filename)] ?? declared;
}

/** Photo, vidéo, ou rien — auquel cas le fichier n'a pas sa place ici. */
export function contentKind(filename: string, declared: string): DeliverableKind | null {
  const mime = contentMime(filename, declared);
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  return null;
}

/** Un nom de fichier ramené à ce qui tient dans un chemin de coffre, extension comprise. */
export function safeFileName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  /* La fin plutôt que le début : c'est elle qui porte l'extension. */
  return cleaned.slice(-80) || "fichier";
}

/*
 * Le chemin se CALCULE des deux côtés : le navigateur y dépose, le serveur l'y relit
 * pour inscrire le fichier. Rien du client n'est donc cru sur parole — un chemin posté
 * à la main ne désignerait qu'un objet recalculé, qui n'existe pas.
 */
export const contentPath = (campaignId: string, id: string, filename: string) => `ugc/${campaignId}/${id}/${safeFileName(filename)}`;

/* ---------- Ce qui manque ---------- */

export type ContentTally = { photos: number; videos: number };

export const tallyContents = (items: { kind: DeliverableKind }[]): ContentTally => ({
  photos: items.filter((i) => i.kind === "photo").length,
  videos: items.filter((i) => i.kind === "video").length,
});

export type Shortfall = {
  photos: number;
  videos: number;
  total: number;
  /** Une quantité a-t-elle été convenue ? Sinon il n'y a rien à décompter. */
  agreed: boolean;
  done: boolean;
};

/*
 * Ce qui manque, par rapport à ce qui a été convenu. Jamais négatif : un partenaire
 * généreux qui envoie huit photos pour cinq n'en fait pas « manquer −3 ». Le surplus se
 * voit dans le décompte (8 sur 5), pas dans le manque.
 */
export function shortfall(expected: ContentQuota, received: ContentTally): Shortfall {
  const photos = Math.max(0, expected.photos - received.photos);
  const videos = Math.max(0, expected.videos - received.videos);
  const agreed = expected.photos + expected.videos > 0;
  return { photos, videos, total: photos + videos, agreed, done: agreed && photos + videos === 0 };
}

const count = (n: number, one: string) => `${n} ${one}${n > 1 ? "s" : ""}`;

const join = (parts: string[]) => parts.join(" et ");

/** « 5 photos et 2 vidéos ». Vide quand rien n'est convenu : le contrat n'annonce alors rien. */
export function quotaLabel(q: ContentQuota): string {
  return join([q.photos > 0 ? count(q.photos, "photo") : "", q.videos > 0 ? count(q.videos, "vidéo") : ""].filter(Boolean));
}

/** « Il manque 2 photos et 1 vidéo », « Tout est arrivé », ou rien à dire. */
export function shortfallLabel(s: Shortfall): string {
  if (!s.agreed) return "Aucune quantité convenue";
  if (s.done) return "Tout est arrivé";
  return `Il manque ${join([s.photos > 0 ? count(s.photos, "photo") : "", s.videos > 0 ? count(s.videos, "vidéo") : ""].filter(Boolean))}`;
}

/** « 3 photos sur 5 · 1 vidéo sur 2 » : le décompte, poste par poste. */
export function progressLabel(expected: ContentQuota, received: ContentTally): string {
  const parts: string[] = [];
  if (expected.photos > 0 || received.photos > 0) parts.push(`${received.photos} ${received.photos > 1 ? "photos" : "photo"} sur ${expected.photos}`);
  if (expected.videos > 0 || received.videos > 0) parts.push(`${received.videos} ${received.videos > 1 ? "vidéos" : "vidéo"} sur ${expected.videos}`);
  return parts.join(" · ");
}

/** Un poids de fichier tel qu'on le lit : « 4,2 Mo ». */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} Go`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} ko`;
}
