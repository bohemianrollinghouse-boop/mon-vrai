import "server-only";
import { storage } from "@/lib/firebase/admin";
import { Media } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Médiathèque : le fichier va dans Cloud Storage, sa fiche dans Firestore. L'envoi
 * passe toujours par le serveur, qui contrôle le type et la taille — le navigateur
 * n'écrit jamais dans le bucket.
 */

const media = () => col("media");

/*
 * Types acceptés. HEIC en est volontairement absent : aucun navigateur ne l'affiche,
 * mieux vaut le refuser clairement à l'envoi que publier une image invisible.
 */
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
  if (input.bytes.byteLength > MAX_BYTES) throw new Error(`Fichier trop volumineux (${Math.round(MAX_BYTES / 1024 / 1024)} Mo maximum)`);

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

/*
 * Verse dans la médiathèque un objet DÉJÀ dans le coffre — un contenu de partenaire.
 *
 * Le fichier est copié d'un préfixe à l'autre par le coffre lui-même, sans passer par
 * la mémoire de l'instance : une vidéo de partenaire pèse couramment dix fois ce qu'une
 * requête peut tenir. C'est une copie et non un déplacement, parce que l'original est
 * une pièce versée au dossier d'une campagne : le publier ne doit pas le retirer de là.
 *
 * Les types refusés le sont pour la même raison que partout ici : un HEIC ou un MOV ne
 * s'affiche dans aucun navigateur, et la médiathèque ne sert qu'à faire paraître.
 */
export async function copyIntoMedia(input: { path: string; mime: string; filename: string; alt?: string }): Promise<Media> {
  if (!ALLOWED.has(input.mime)) throw new Error(`Ce format ne peut pas paraître sur le site (${input.mime}). Convertissez-le d'abord.`);

  const bucket = storage().bucket();
  const source = bucket.file(input.path);
  const [exists] = await source.exists();
  if (!exists) throw new Error("Le fichier n'est plus dans le coffre.");

  const id = newId("med");
  const safeName = input.filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  const path = `media/${id}/${safeName}`;
  await source.copy(bucket.file(path), { contentType: input.mime, metadata: { cacheControl: "public, max-age=31536000, immutable" } });

  const doc = Media.parse({ id, path, url: publicUrl(bucket.name, path), alt: input.alt ?? "", mime: input.mime, createdAt: now() });
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
 *
 * Exportée : les recadrages de newsletter (`newsletter/crops.ts`) déposent leurs
 * dérivés sous `media/` — le seul préfixe public — et doivent en donner la même adresse.
 */
export function publicUrl(bucketName: string, path: string): string {
  const encoded = encodeURIComponent(path);
  const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulator) {
    return `http://${emulator}/v0/b/${bucketName}/o/${encoded}?alt=media`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media`;
}
