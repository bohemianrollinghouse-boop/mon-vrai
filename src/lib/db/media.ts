import "server-only";
import { storage } from "@/lib/firebase/admin";
import { Media } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Médiathèque : le fichier va dans Cloud Storage, sa fiche dans Firestore. L'envoi
 * passe toujours par le serveur, qui contrôle le type et la taille - le navigateur
 * n'écrit jamais dans le bucket.
 */

const media = () => col("media");

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml", "image/gif", "video/mp4", "video/webm", "application/pdf"]);
const MAX_BYTES = 40 * 1024 * 1024;

export async function listMedia(limit = 200): Promise<Media[]> {
  return parseQuery(Media, media().orderBy("createdAt", "desc").limit(limit));
}

export async function getMedia(id: string): Promise<Media | null> {
  return parseDoc(Media, await media().doc(id).get());
}

export type UploadInput = {
  bytes: Buffer;
  mime: string;
  filename: string;
  alt?: string;
  width?: number;
  height?: number;
};

export async function uploadMedia(input: UploadInput): Promise<Media> {
  if (!ALLOWED.has(input.mime)) throw new Error(`Type de fichier refusé : ${input.mime}`);
  if (input.bytes.byteLength > MAX_BYTES) throw new Error("Fichier trop volumineux (12 Mo maximum)");

  const id = newId("med");
  const safeName = input.filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  const path = `media/${id}/${safeName}`;

  const bucket = storage().bucket();
  const file = bucket.file(path);
  await file.save(input.bytes, {
    contentType: input.mime,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });

  const doc = Media.parse({
    id,
    path,
    url: publicUrl(bucket.name, path),
    alt: input.alt ?? "",
    width: input.width,
    height: input.height,
    mime: input.mime,
    createdAt: now(),
  });
  await media().doc(id).set(doc);
  return doc;
}

export async function updateMediaAlt(id: string, alt: string): Promise<void> {
  await media().doc(id).update({ alt });
}

export async function deleteMedia(id: string): Promise<void> {
  const doc = await getMedia(id);
  if (!doc) return;
  await storage().bucket().file(doc.path).delete({ ignoreNotFound: true });
  await media().doc(id).delete();
}

/**
 * URL publique du fichier. Avec l'émulateur, l'hôte est local ; en production, le
 * point d'entrée Firebase Storage sert les objets rendus publics par les règles.
 */
function publicUrl(bucketName: string, path: string): string {
  const encoded = encodeURIComponent(path);
  const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulator) {
    return `http://${emulator}/v0/b/${bucketName}/o/${encoded}?alt=media`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media`;
}
