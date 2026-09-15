"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getDocument } from "@/lib/db/documents";
import { deleteExpense, getExpense, upsertExpense } from "@/lib/db/expenses";
import { getProduct } from "@/lib/db/products";
import { parseEuroToCents } from "@/lib/domain/money";
import { CashDirection, DayString, ExpenseCategory, ExpenseMethod, ExpenseRecurrence } from "@/lib/domain/types";

/*
 * Saisie des mouvements d'argent (/admin/depenses). Le montant arrive en euros du
 * formulaire et repart en centimes : `parseEuroToCents` est le seul passage autorisé.
 * Le titre et le justificatif rattachés sont RELUS en base — un identifiant venu du
 * navigateur ne prouve rien.
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
  productSlug: z.string().trim().default(""),
  units: z.number().int().min(0).max(1_000_000).default(0),
  documentId: z.string().trim().default(""),
  note: z.string().trim().max(500).default(""),
});

export async function saveExpenseAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["units"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  let amount = 0;
  try {
    amount = parseEuroToCents(d.amountEuros);
  } catch {
    return failed("Montant invalide.", { amountEuros: "Par exemple 149,90" });
  }
  if (amount === 0) return failed("Le montant ne peut pas être nul.", { amountEuros: "Montant requis" });

  if (d.productSlug && !(await getProduct(d.productSlug))) return failed("Ce titre n'existe pas.", { productSlug: "Titre inconnu" });
  if (d.documentId && !(await getDocument(d.documentId))) return failed("Ce justificatif n'existe plus.", { documentId: "Document introuvable" });

  const existed = d.id ? await getExpense(d.id) : null;
  if (d.id && !existed) return failed("Cette ligne n'existe plus.");

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
    productSlug: d.productSlug,
    units: d.units,
    documentId: d.documentId,
    note: d.note,
  });

  await audit(user.email, existed ? "expense.update" : "expense.create", `expenses/${doc.id}`, `${doc.label} · ${(amount / 100).toFixed(2)} €`);
  revalidatePath("/admin/depenses");
  revalidatePath(`/admin/depenses/${doc.id}`);
  return existed ? saved("Ligne enregistrée.") : saved(`« ${doc.label} » ajouté.`);
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
