import type { Deliverable, Influencer, Media } from "@/lib/domain/types";

/*
 * Tout ce qu'on possède en images et en vidéos, dans un seul écran.
 *
 * Il y a deux coffres, et il faut qu'il y en ait deux. `media/` est lisible par TOUT LE
 * MONDE — c'est ce qui permet à une photo produit de s'afficher sur la boutique, et
 * aucun mot de passe d'administration n'y change quoi que ce soit : qui a l'adresse a le
 * fichier. `ugc/` est fermé, et sert ce que les créateurs nous confient, qui n'a pas à
 * être public du seul fait qu'on l'a reçu.
 *
 * Ce qui n'avait pas lieu d'être double, c'est l'ÉCRAN. On ne cherche pas une photo
 * « dans le coffre public » ou « dans le coffre privé » : on cherche une photo. Cette
 * étagère réunit donc les deux listes sans rien recopier — la copie, elle, rendrait
 * public ce qui ne l'est pas.
 *
 * Pur et testé : l'écran s'en sert, et rien n'y est lu.
 */

export type ShelfItem = {
  /** Unique à travers les deux sources : `med:<id>` ou `ugc:<id>`. */
  key: string;
  /** `library` : public, utilisable sur le site. `content` : privé, reçu d'un créateur. */
  kind: "library" | "content";
  id: string;
  /** Le dossier où il se range : le nom d'un créateur, ou rien pour le fonds commun. */
  folder: string;
  filename: string;
  /** Où l'administration va le chercher pour l'afficher. */
  src: string;
  mime: string;
  at: number;
  alt: string;
  /** L'adresse publique, quand il en a une. Vide : il n'est pas sur le web. */
  url: string;
  /** Pour un contenu : la campagne d'où il vient, et à qui on le doit. */
  campaignId: string;
  influencerId: string;
  /** Pour un contenu déjà versé au public : l'identifiant de sa copie. */
  mediaId: string;
};

export const isImage = (mime: string): boolean => mime.startsWith("image/");
export const isVideo = (mime: string): boolean => mime.startsWith("video/");

const fileName = (path: string, fallback: string): string => path.split("/").pop() ?? fallback;

export function mediaShelf(input: { media: Media[]; deliverables: Deliverable[]; influencers: Influencer[] }): ShelfItem[] {
  const names = new Map(input.influencers.map((i) => [i.id, i.name]));

  const library: ShelfItem[] = input.media.map((m) => ({
    key: `med:${m.id}`,
    kind: "library",
    id: m.id,
    folder: m.folder,
    filename: fileName(m.path, m.id),
    src: m.url,
    mime: m.mime,
    at: m.createdAt,
    alt: m.alt,
    url: m.url,
    campaignId: "",
    influencerId: "",
    mediaId: "",
  }));

  const contents: ShelfItem[] = input.deliverables.map((d) => ({
    key: `ugc:${d.id}`,
    kind: "content",
    id: d.id,
    /* Le dossier d'un contenu est le nom de son créateur : c'est ainsi qu'on retrouve
       « ce que Camille nous a envoyé » sans ouvrir sa campagne. */
    folder: names.get(d.influencerId) ?? "Créateur retiré",
    filename: d.filename,
    /* Servi par la route de l'administration : le coffre, lui, reste fermé. */
    src: `/api/contenus/${d.id}`,
    mime: d.mime,
    at: d.receivedAt,
    alt: "",
    url: "",
    campaignId: d.campaignId,
    influencerId: d.influencerId,
    mediaId: d.mediaId,
  }));

  /* Le plus récent d'abord : on cherche presque toujours ce qu'on vient de recevoir. */
  return [...library, ...contents].sort((a, b) => b.at - a.at);
}

/*
 * Les dossiers se DÉDUISENT des fichiers : aucune liste à tenir, aucun dossier vide qui
 * traîne, et celui d'un créateur dont on efface tout disparaît de lui-même.
 */
export function shelfFolders(items: ShelfItem[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.folder) continue;
    counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Ce que l'écran montre, une fois le dossier et la nature choisis. */
export function filterShelf(items: ShelfItem[], folder: string, nature: string): ShelfItem[] {
  return items.filter((item) => {
    if (folder === "commun" ? item.folder !== "" : folder && item.folder !== folder) return false;
    if (nature === "photos" && !isImage(item.mime)) return false;
    if (nature === "videos" && !isVideo(item.mime)) return false;
    if (nature === "prives" && item.kind !== "content") return false;
    return true;
  });
}
