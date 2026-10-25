import "server-only";
import { storage } from "@/lib/firebase/admin";
import { BusinessDoc } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";
import { ALLOWED_DOC_MIMES, documentMime, documentPath, MAX_DOC_BYTES } from "@/lib/domain/documents";

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

/* ---------- Dépôt direct depuis le navigateur ---------- */

/** Le coffre, par son nom : le navigateur en a besoin pour viser le bon. */
export const bucketName = (): string => storage().bucket().name;

/*
 * L'identifiant est posé AVANT l'envoi — il nomme le dossier où le fichier atterrit.
 * Son préfixe est vérifié au retour : ce qui revient du navigateur doit avoir la forme
 * de ce qu'on lui a donné.
 */
export const newDocumentId = (): string => newId("doc");
export const looksLikeDocumentId = (id: string): boolean => /^doc_[a-z0-9]{20}$/.test(id);

export type RecordDocInput = DocumentMeta & { id: string; filename: string };

/*
 * Inscrit une pièce DÉJÀ déposée dans le coffre par le navigateur.
 *
 * Le fichier ne passe plus par le serveur, et pour une raison qu'on a payée : un
 * rapport de laboratoire scanné pèse couramment plus de quinze mégaoctets, et une
 * action serveur le fait traverser trois fois la mémoire d'une instance qui n'a qu'un
 * gigaoctet (corps de la requête, `arrayBuffer`, `Buffer`). Le dépôt mourait alors sans
 * un mot — une page d'erreur nue, et rien nulle part. C'est exactement ce qui avait
 * imposé le même détour aux contenus de partenaires (db/deliverables.ts).
 *
 * Ce que le client annonce n'est pour autant cru sur rien : le chemin est RECALCULÉ, le
 * type et la taille sont relus sur l'objet lui-même, et une pièce qui n'a pas sa place
 * ici est effacée du coffre séance tenante — sans fiche, rien ne la retrouverait plus
 * et elle se paierait indéfiniment.
 */
export async function recordDocument(input: RecordDocInput): Promise<BusinessDoc> {
  if (!looksLikeDocumentId(input.id)) throw new Error("Référence de pièce invalide");
  if (await getDocument(input.id)) throw new Error("Cette pièce est déjà au dossier");

  const path = documentPath(input.id, input.filename);
  const file = storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Le fichier n'est pas arrivé dans le coffre : réessayez.");

  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  const mime = documentMime(input.filename, String(meta.contentType ?? ""));

  const refusal =
    !ALLOWED_DOC_MIMES.has(mime) ? `Type de fichier refusé : ${mime || "inconnu"}`
    : size === 0 ? "Fichier vide"
    : size > MAX_DOC_BYTES ? `Fichier trop volumineux (${Math.round(MAX_DOC_BYTES / 1024 / 1024)} Mo maximum)`
    : "";
  if (refusal) {
    await file.delete({ ignoreNotFound: true });
    throw new Error(refusal);
  }

  /* Le nom retenu est le dernier segment du CHEMIN, et non celui qu'on nous a donné :
     c'est lui qui désigne vraiment l'objet dans le coffre. */
  const { id, ...rest } = input;
  const doc = BusinessDoc.parse({ ...rest, id, path, filename: path.split("/").pop(), mime, size, uploadedAt: now(), updatedAt: now() });
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
