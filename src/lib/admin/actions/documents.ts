"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { bucketName, deleteDocument, getDocument, newDocumentId, recordDocument, updateDocument, uploadDocument } from "@/lib/db/documents";
import { documentMime, documentPath, ALLOWED_DOC_MIMES } from "@/lib/domain/documents";
import { detachDocument } from "@/lib/db/expenses";
import { getProduct, listAllProducts, setProductIsbn } from "@/lib/db/products";
import { isValidIsbn, normalizeIsbn } from "@/lib/domain/isbn";
import { DayString, DocKind } from "@/lib/domain/types";

/*
 * Bibliothèque des pièces administratives (/admin/documents) : envoi, fiche, suppression,
 * et attribution des ISBN aux titres. Les fichiers ne sont jamais publics : uploadDocument
 * les dépose sous `documents/`, fermé par storage.rules, et /api/documents/<id> les sert
 * à l'administrateur seul.
 */

const OptionalDay = z.union([DayString, z.literal("")]).default("");

const Meta = z.object({
  title: z.string().trim().min(1, "Un titre est nécessaire").max(160),
  kind: DocKind,
  issuedAt: OptionalDay,
  expiresAt: OptionalDay,
  productSlug: z.string().trim().default(""),
  isbn: z.string().trim().max(20).default(""),
  reference: z.string().trim().max(120).default(""),
  note: z.string().trim().max(500).default(""),
});

/*
 * Un refus, sous une forme plus étroite qu'AdminResult : il s'assigne aussi bien à un
 * AdminResult qu'à un ConfirmDocResult, ce qu'une union ouverte ne permet pas.
 */
type Refusal = { ok: false; error: string; issues?: Record<string, string> };
const refuse = (error: string, issues?: Record<string, string>): Refusal => ({ ok: false, error, issues });

/** Contrôles communs à l'envoi et à la modification : le titre lié existe, l'ISBN tient debout. */
async function checkMeta(meta: z.infer<typeof Meta>): Promise<{ ok: true; isbn: string } | { ok: false; result: Refusal }> {
  if (meta.productSlug && !(await getProduct(meta.productSlug))) return { ok: false, result: refuse("Ce titre n'existe pas.", { productSlug: "Titre inconnu" }) };
  const isbn = meta.isbn ? normalizeIsbn(meta.isbn) : "";
  if (isbn && !isValidIsbn(isbn)) return { ok: false, result: refuse("Cet ISBN n'est pas valide (clé de contrôle).", { isbn: "ISBN invalide" }) };
  if (meta.issuedAt && meta.expiresAt && meta.expiresAt < meta.issuedAt) {
    return { ok: false, result: refuse("La fin de validité précède la date du document.", { expiresAt: "Date invalide" }) };
  }
  return { ok: true, isbn };
}

/* ---------- Dépôt en trois temps : préparer, déposer, inscrire ---------- */

export type PrepareDocResult = { ok: true; id: string; path: string; bucket: string } | { ok: false; error: string };

/** Comme un AdminResult, mais qui rend l'identifiant de la pièce créée. */
export type ConfirmDocResult = { ok: true; id: string; message: string } | { ok: false; error: string; issues?: Record<string, string> };

/*
 * Où déposer ce fichier. Le chemin est CALCULÉ ici et recalculé à l'inscription : un
 * chemin posté à la main ne désignerait qu'un objet qui n'existe pas.
 *
 * Le type est refusé ici aussi, et pas seulement par les règles du coffre : mieux vaut
 * le dire avant d'avoir envoyé vingt mégaoctets pour rien.
 */
export async function prepareDocumentAction(filename: string, mime: string): Promise<PrepareDocResult> {
  await assertAdmin();
  const real = documentMime(filename, mime);
  if (!ALLOWED_DOC_MIMES.has(real)) {
    return { ok: false, error: `${filename} : type refusé (${real || "inconnu"}). Acceptés : PDF, JPEG, PNG, WebP, TIFF, CSV, Word, Excel, ZIP.` };
  }

  const id = newDocumentId();
  return { ok: true, id, path: documentPath(id, filename), bucket: bucketName() };
}

/*
 * Le fichier est arrivé dans le coffre : on le relit, et on lui fait sa fiche.
 *
 * Les métadonnées arrivent par le formulaire, comme avant — c'est le FICHIER qui ne
 * passe plus par là.
 */
export async function confirmDocumentAction(id: string, filename: string, formData: FormData): Promise<ConfirmDocResult> {
  try {
    const user = await assertAdmin();

    const parsed = parseForm(Meta, formData);
    if (!parsed.ok) return refuse(parsed.error, parsed.issues);
    const checked = await checkMeta(parsed.data);
    if (!checked.ok) return checked.result;

    const doc = await recordDocument({ ...parsed.data, isbn: checked.isbn, id, filename });

    /* Le journal est une commodité, pas une condition : une écriture d'audit qui échoue
       ne doit pas faire croire que la pièce n'est pas arrivée, alors qu'elle l'est. */
    await audit(user.email, "document.upload", `documents/${doc.id}`, doc.title).catch(() => undefined);
    revalidatePath("/admin/documents");
    revalidatePath("/admin/contrats");
    /* L'identifiant revient à l'appelant : c'est ce qui permet à la fiche d'un contrat
       d'attacher l'annexe dans la foulée, sans la faire rechoisir dans un menu. */
    return { ok: true, id: doc.id, message: `« ${doc.title} » déposé.` };
  } catch (e) {
    return refuse(`${filename} : ${(e as Error).message}`);
  }
}

/*
 * Le dépôt d'une pièce PAR LE SERVEUR. Conservé pour les justificatifs de dépenses,
 * qui sont joints à un formulaire déjà lourd en champs et pèsent rarement plus d'un
 * mégaoctet. Les deux cartes de dépôt, elles, passent désormais par le coffre
 * directement (voir prepareDocumentAction) : un scan de rapport de laboratoire ne
 * tenait pas dans la mémoire d'une instance.
 *
 * Tout le corps est sous garde, et pas seulement l'écriture du fichier. Une action
 * serveur qui LÈVE ne revient pas au formulaire : Next remonte l'exception jusqu'à la
 * limite d'erreur de la route, qui remplace la page par « A server error occurred »,
 * sans un mot sur ce qui s'est passé — le `<Toast>` d'ActionForm, lui, n'attend qu'un
 * résultat `{ ok: false }`. Le dépôt paraissait donc ne pas marcher, et la raison
 * n'existait que dans les journaux de Cloud Run.
 *
 * C'est la même règle qu'au champ « fichier » (voir DocumentFileField) : le pire des
 * échecs est celui qui ne se dit pas. Le garde-fou ne corrige rien par lui-même — il
 * fait remonter le motif là où on le lit, et c'est ce qui manquait.
 */
export async function uploadDocumentAction(formData: FormData): Promise<AdminResult> {
  try {
    return await deposit(formData);
  } catch (e) {
    /* Y compris une session expirée ou révoquée : « Accès réservé à l'administration »
       se lit, là où une page morte laissait croire à une panne du dépôt. */
    return failed(`Le dépôt a échoué : ${(e as Error).message}`);
  }
}

async function deposit(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failed("Choisissez un fichier.", { file: "Fichier requis" });

  const parsed = parseForm(Meta, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const checked = await checkMeta(parsed.data);
  if (!checked.ok) return checked.result;

  let id: string;
  try {
    const doc = await uploadDocument({ ...parsed.data, isbn: checked.isbn, bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, filename: file.name });
    id = doc.id;
  } catch (e) {
    return failed(`${file.name} : ${(e as Error).message}`, { file: "Fichier refusé" });
  }

  /*
   * Le fichier est déposé : à partir d'ici, plus rien ne doit faire échouer le dépôt.
   * Le journal est une commodité, pas une condition — une écriture d'audit qui échoue
   * ne doit pas faire croire que la pièce n'est pas arrivée, alors qu'elle l'est.
   */
  await audit(user.email, "document.upload", `documents/${id}`, parsed.data.title).catch(() => undefined);
  revalidatePath("/admin/documents");
  revalidatePath("/admin/contrats");
  return saved(`« ${parsed.data.title} » déposé.`);
}

export async function updateDocumentAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || !(await getDocument(id))) return failed("Ce document n'existe plus.");

  const parsed = parseForm(Meta, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const checked = await checkMeta(parsed.data);
  if (!checked.ok) return checked.result;

  await updateDocument(id, { ...parsed.data, isbn: checked.isbn });
  await audit(user.email, "document.update", `documents/${id}`, parsed.data.title);
  revalidatePath("/admin/documents");
  return saved("Fiche enregistrée.");
}

export async function deleteDocumentAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const existing = id ? await getDocument(id) : null;
  if (!existing) return failed("Ce document n'existe plus.");

  await deleteDocument(id);
  // Les frais qui s'y rattachaient restent, mais sans justificatif : mieux vaut un
  // champ vide qu'un lien vers un fichier effacé.
  await detachDocument(id);
  await audit(user.email, "document.delete", `documents/${id}`, existing.title);
  revalidatePath("/admin/documents");
  revalidatePath("/admin/depenses");
  return saved("Document supprimé.");
}

/*
 * Attribution d'un ISBN à un titre. Deux contrôles : la clé de contrôle (un chiffre
 * recopié de travers ne se voit pas à l'œil) et l'unicité — deux livres sous le même
 * ISBN, c'est un signalement à l'AFNIL et des commandes mal identifiées en librairie.
 */
export async function saveIsbnAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  const raw = String(formData.get("isbn") ?? "").trim();

  const product = slug ? await getProduct(slug) : null;
  if (!product) return failed("Ce titre n'existe pas.");

  if (!raw) {
    await setProductIsbn(slug, "");
    await audit(user.email, "product.isbn", `products/${slug}`, "retiré");
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/produits/${slug}`);
    return saved(`ISBN retiré de « ${product.title} ».`);
  }

  const isbn = normalizeIsbn(raw);
  if (!isValidIsbn(isbn)) return failed("Cet ISBN n'est pas valide (clé de contrôle).", { isbn: "ISBN invalide" });
  const taken = (await listAllProducts()).find((p) => p.slug !== slug && p.isbn && normalizeIsbn(p.isbn) === isbn);
  if (taken) return failed(`Cet ISBN est déjà celui de « ${taken.title} ».`, { isbn: "Déjà attribué" });

  await setProductIsbn(slug, isbn);
  await audit(user.email, "product.isbn", `products/${slug}`, isbn);
  revalidatePath("/admin/documents");
  revalidatePath(`/admin/produits/${slug}`);
  return saved(`ISBN enregistré pour « ${product.title} ».`);
}
