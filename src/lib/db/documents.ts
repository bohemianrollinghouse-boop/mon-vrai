import "server-only";
import { storage } from "@/lib/firebase/admin";
import { BusinessDoc } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";
import { ALLOWED_DOC_MIMES, documentMime } from "@/lib/domain/documents";

/*
 * Bibliothèque des pièces administratives : normes CE, rapports de laboratoire,
 * attributions d'ISBN, factures fournisseurs, contrats, assurances.
 *
 * Contrairement à la médiathèque, RIEN n'est public ici : le fichier va sous
 * `documents/` (fermé par storage.rules) et n'est servi que par /api/documents/<id>,
 * après vérification de l'administrateur. On ne stocke donc pas d'URL — seulement le
 * chemin dans le bucket.
 */

const documents = () => col("documents");

const MAX_BYTES = 40 * 1024 * 1024;

export async function listDocuments(limit = 500): Promise<BusinessDoc[]> {
  const list = await parseQuery(BusinessDoc, documents().limit(limit));
  return list.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function getDocument(id: string): Promise<BusinessDoc | null> {
  return parseDoc(BusinessDoc, await documents().doc(id).get());
}

export type DocumentMeta = Omit<BusinessDoc, "id" | "path" | "filename" | "mime" | "size" | "uploadedAt" | "updatedAt">;
export type DocumentUpload = DocumentMeta & { bytes: Buffer; mime: string; filename: string };

export async function uploadDocument(input: DocumentUpload): Promise<BusinessDoc> {
  const { bytes, filename, ...meta } = input;
  const mime = documentMime(filename, input.mime);
  if (!ALLOWED_DOC_MIMES.has(mime)) {
    throw new Error(
      input.mime
        ? `Type de fichier refusé : ${input.mime}. Acceptés : PDF, JPEG, PNG, WebP, TIFF, CSV, Word, Excel, ZIP.`
        : `Type de fichier non reconnu pour « ${filename} ». Vérifiez son extension (.pdf, .jpg, .png, .docx, .xlsx, .zip).`,
    );
  }
  if (bytes.byteLength > MAX_BYTES) throw new Error(`Fichier trop volumineux (${Math.round(MAX_BYTES / 1024 / 1024)} Mo maximum)`);

  const id = newId("doc");
  const safeName = filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "piece";
  const path = `documents/${id}/${safeName}`;
  await storage().bucket().file(path).save(bytes, { contentType: mime, metadata: { cacheControl: "private, max-age=0" } });

  const doc = BusinessDoc.parse({ ...meta, id, path, filename: safeName, mime, size: bytes.byteLength, uploadedAt: now(), updatedAt: now() });
  await documents().doc(id).set(doc);
  return doc;
}

/** Réécrit les seules métadonnées : le fichier déposé ne change jamais. */
export async function updateDocument(id: string, meta: DocumentMeta): Promise<BusinessDoc | null> {
  const existing = await getDocument(id);
  if (!existing) return null;
  const doc = BusinessDoc.parse({ ...existing, ...meta, updatedAt: now() });
  await documents().doc(id).set(doc);
  return doc;
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  await storage().bucket().file(doc.path).delete({ ignoreNotFound: true });
  await documents().doc(id).delete();
}

/** Lit le fichier pour le servir. `null` si la fiche ou l'objet a disparu. */
export async function readDocumentFile(id: string): Promise<{ doc: BusinessDoc; bytes: Buffer } | null> {
  const doc = await getDocument(id);
  if (!doc) return null;
  try {
    const [bytes] = await storage().bucket().file(doc.path).download();
    return { doc, bytes };
  } catch {
    return null;
  }
}
