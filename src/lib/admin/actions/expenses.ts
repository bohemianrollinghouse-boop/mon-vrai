"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getDocument, uploadDocument } from "@/lib/db/documents";
import { deleteExpense, getExpense, upsertExpense } from "@/lib/db/expenses";
import { getProductsBySlugs } from "@/lib/db/products";
import { parseEuroToCents } from "@/lib/domain/money";
import { CashDirection, DayString, type DocKind, type ExpenseCategory as Category, ExpenseCategory, ExpenseMethod, ExpenseRecurrence } from "@/lib/domain/types";

/*
 * Saisie des mouvements d'argent (/admin/depenses). Le montant arrive en euros du
 * formulaire et repart en centimes : `parseEuroToCents` est le seul passage autorisé.
 * Les titres et les justificatifs rattachés sont RELUS en base — un identifiant venu du
 * navigateur ne prouve rien.
 *
 * Le formulaire sait aussi DÉPOSER des pièces : les fichiers joints deviennent des
 * documents de la bibliothèque (privés, comme tous les autres) et s'attachent au
 * mouvement dans la foulée. C'est l'ordre naturel — on a la facture sous la main au
 * moment où l'on saisit la dépense, pas trois écrans plus loin.
 */

const Input = z.object({
  id: z.string().trim().default(""),
  direction: CashDirection,
  category: ExpenseCategory,
  label: z.string().trim().min(1, "Un intitulé est nécessaire").max(120),
  supplier: z.string().trim().max(120).default(""),
  amountEuros: z.string().trim().min(1, "Montant requis"),
  date: DayString,
  method: ExpenseMethod,
  status: z.enum(["paid", "pending"]),
  recurrence: ExpenseRecurrence,
  note: z.string().trim().max(500).default(""),
});

/** Nature présumée d'une pièce déposée depuis un mouvement, d'après son poste. */
const KIND_FOR: Partial<Record<Category, DocKind>> = {
  certification: "certification",
  lab: "lab",
  isbn: "isbn",
  insurance: "insurance",
  taxes: "tax",
  accounting: "tax",
};

/** « Facture Bureau Veritas.pdf » → « Facture Bureau Veritas ». */
const baseName = (filename: string) => filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

export async function saveExpenseAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();

  /*
   * Les listes se relèvent avant `parseForm` : `formToObject` ne sait pas qu'un champ
   * répété est une liste, il n'en garderait que la dernière valeur. Même façon de faire
   * que les produits offerts d'un code promo.
   */
  const slugs = [...new Set(formData.getAll("productSlugs").map(String).filter(Boolean))];
  const docIds = [...new Set(formData.getAll("documentIds").map(String).filter(Boolean))];
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  formData.delete("productSlugs");
  formData.delete("documentIds");
  formData.delete("files");

  const parsed = parseForm(Input, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  let amount = 0;
  try {
    amount = parseEuroToCents(d.amountEuros);
  } catch {
    return failed("Montant invalide.", { amountEuros: "Par exemple 149,90" });
  }
  if (amount === 0) return failed("Le montant ne peut pas être nul.", { amountEuros: "Montant requis" });

  const products = await getProductsBySlugs(slugs);
  const unknown = slugs.filter((s) => !products.has(s));
  if (unknown.length > 0) return failed(`Titre inconnu : ${unknown.join(", ")}.`, { productSlugs: "Titre inconnu" });

  const attached = await Promise.all(docIds.map((id) => getDocument(id)));
  if (attached.some((doc) => doc === null)) return failed("Un des justificatifs choisis n'existe plus.", { documentIds: "Document introuvable" });

  const existed = d.id ? await getExpense(d.id) : null;
  if (d.id && !existed) return failed("Cette ligne n'existe plus.");

  /*
   * Les fichiers joints deviennent des pièces à part entière. Ce qu'on sait du mouvement
   * les renseigne d'avance — date, nature, titre quand il n'y en a qu'un —, et tout reste
   * modifiable depuis /admin/documents.
   */
  const uploaded: string[] = [];
  for (const file of files) {
    try {
      const doc = await uploadDocument({
        bytes: Buffer.from(await file.arrayBuffer()),
        mime: file.type,
        filename: file.name,
        title: baseName(file.name) || d.label,
        kind: KIND_FOR[d.category] ?? "invoice",
        issuedAt: d.date,
        expiresAt: "",
        productSlug: slugs.length === 1 ? slugs[0] : "",
        isbn: "",
        reference: "",
        note: `Déposé depuis le mouvement « ${d.label} ».`,
      });
      uploaded.push(doc.id);
      await audit(user.email, "document.upload", `documents/${doc.id}`, file.name);
    } catch (e) {
      /*
       * Le mouvement n'est pas enregistré si une pièce est refusée : mieux vaut une
       * saisie à refaire qu'une dépense enregistrée sans le justificatif qu'on croyait
       * y avoir joint. Les pièces déjà passées, elles, restent dans la bibliothèque.
       */
      return failed(`${file.name} : ${(e as Error).message}`, { files: "Fichier refusé" });
    }
  }

  const doc = await upsertExpense({
    id: d.id || undefined,
    direction: d.direction,
    category: d.category,
    label: d.label,
    supplier: d.supplier,
    amount,
    date: d.date,
    method: d.method,
    status: d.status,
    recurrence: d.recurrence,
    productSlugs: slugs,
    documentIds: [...docIds, ...uploaded],
    note: d.note,
  });

  await audit(user.email, existed ? "expense.update" : "expense.create", `expenses/${doc.id}`, `${doc.label} · ${(amount / 100).toFixed(2)} €`);
  revalidatePath("/admin/depenses");
  revalidatePath(`/admin/depenses/${doc.id}`);
  if (uploaded.length > 0) revalidatePath("/admin/documents");

  const withFiles = uploaded.length > 0 ? ` ${uploaded.length} pièce${uploaded.length > 1 ? "s" : ""} déposée${uploaded.length > 1 ? "s" : ""}.` : "";
  return existed ? saved(`Ligne enregistrée.${withFiles}`) : saved(`« ${doc.label} » ajouté.${withFiles}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const existing = id ? await getExpense(id) : null;
  if (!existing) return failed("Cette ligne n'existe plus.");
  await deleteExpense(id);
  await audit(user.email, "expense.delete", `expenses/${id}`, existing.label);
  revalidatePath("/admin/depenses");
  return { ok: true, message: "Ligne supprimée.", redirectTo: "/admin/depenses" };
}
