import { readFile } from "node:fs/promises";
import path from "node:path";
import { getHomeContent, saveHomeContent } from "@/lib/db/content";
import { uploadMedia } from "@/lib/db/media";

/*
 * Remplace la vidéo et l'affiche de l'accueil par les fichiers de content/…/media,
 * sans toucher au reste du contenu ni aux réglages (contrairement au seed complet).
 *   NODE_OPTIONS=--conditions=react-server tsx --env-file=.env.local scripts/update-hero.ts
 */
const MEDIA = path.resolve(process.cwd(), "content/shopify-export/media");

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes("--force")) {
    throw new Error("Aucun émulateur détecté. Ajoute --force pour viser la vraie base.");
  }
  const home = await getHomeContent();
  if (!home) throw new Error("Contenu d'accueil introuvable");
  const video = await uploadMedia({ bytes: await readFile(path.join(MEDIA, "hero.mp4")), mime: "video/mp4", filename: "hero.mp4", alt: "Vidéo d'accueil" });
  const poster = await uploadMedia({ bytes: await readFile(path.join(MEDIA, "hero-poster.jpg")), mime: "image/jpeg", filename: "hero-poster.jpg", alt: "Première image de la vidéo d'accueil", width: 1600, height: 900 });
  const { updatedAt: _u, ...rest } = home;
  void _u;
  await saveHomeContent({ ...rest, hero: { ...home.hero, videoUrl: video.url, posterUrl: poster.url } });
  console.log("accueil mis à jour :", video.url, poster.url);
}
main().then(() => process.exit(0));
