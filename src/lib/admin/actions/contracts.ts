"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteContract, getContract, listContracts, upsertContract } from "@/lib/db/contracts";
import { CollaborationType } from "@/lib/domain/types";

/*
 * Contrats de collaboration. Un contrat déjà signé ne se réécrit pas : la signature en
 * garde une copie figée, et la version (« UGC-2026-09-v1 ») dit laquelle a été acceptée.
 * Modifier le texte d'un contrat vaut donc pour les signatures À VENIR seulement — d'où
 * l'insistance de l'écran sur le numéro de version.
 */

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1, "Donnez un nom au contrat").max(120),
  type: CollaborationType,
  version: z.string().trim().min(1, "Indiquez une version").max(40),
  summary: z.string().max(8000).default(""),
  body: z.string().max(200000).default(""),
  active: z.boolean().default(true),
});

/* Les variables de campagne arrivent en champs `var:CLÉ` : l'éditeur les détecte dans
   le texte, il n'y a donc pas de liste fixe à tenir ici. */
function variablesFrom(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("var:") || typeof value !== "string") continue;
    const name = key.slice(4);
    if (/^[A-Z0-9_]{1,60}$/.test(name)) out[name] = value.slice(0, 2000);
  }
  return out;
}

export async function saveContractAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { booleans: ["active"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  if (!d.body.trim()) return failed("Le contrat est vide.", { body: "Requis" });

  const others = (await listContracts()).filter((c) => c.id !== d.id);
  if (others.some((c) => c.version.toLowerCase() === d.version.toLowerCase())) {
    return failed(`La version « ${d.version} » existe déjà. Une version ne se réutilise jamais : elle identifie ce qui a été signé.`, { version: "Déjà utilisée" });
  }

  const contract = await upsertContract({
    id: d.id || undefined,
    name: d.name,
    type: d.type,
    version: d.version,
    summary: d.summary,
    body: d.body,
    variables: variablesFrom(formData),
    active: d.active,
  });
  await audit(user.email, d.id ? "contract.update" : "contract.create", `contracts/${contract.id}`, `${contract.name} · ${contract.version}`);
  revalidatePath("/admin/contrats");
  return { ok: true, message: `Contrat « ${contract.name} » enregistré.`, redirectTo: `/admin/contrats?id=${contract.id}` };
}

export async function deleteContractAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return failed("Contrat inconnu");
  const contract = await getContract(id);
  if (!contract) return failed("Contrat introuvable");

  await deleteContract(id);
  await audit(user.email, "contract.delete", `contracts/${id}`, `${contract.name} · ${contract.version}`);
  revalidatePath("/admin/contrats");
  // Redirection côté serveur : la fiche que l'on vient d'effacer se rendrait en 404.
  redirect("/admin/contrats");
}
