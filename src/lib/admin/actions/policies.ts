"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deletePolicy, getPolicy, listPolicies, upsertPolicy } from "@/lib/db/policies";
import { slugify } from "@/lib/domain/slug";
import { Slug } from "@/lib/domain/types";

/*
 * Pages légales. Comme les pages libres, avec un ordre d'affichage (menu latéral) et
 * sans notion de brouillon : une page légale est publiée ou n'existe pas.
 */

const Input = z.object({
  originalHandle: z.string().default(""),
  handle: z.string().trim().default(""),
  title: z.string().trim().min(1, "Le titre est requis").max(120),
  bodyHtml: z.string().default(""),
  bodyJson: z.string().default("null"),
  position: z.number().int().default(0),
});

export async function savePolicyAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["position"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const handleResult = Slug.safeParse(d.handle ? slugify(d.handle) : slugify(d.title));
  if (!handleResult.success) return failed("Adresse invalide", { handle: "Minuscules, chiffres et tirets" });
  const handle = handleResult.data;
  if (handle !== d.originalHandle && (await getPolicy(handle))) return failed(`Une page légale existe déjà à « ${handle} »`, { handle: "Déjà utilisée" });

  let json: unknown = null;
  try {
    json = JSON.parse(d.bodyJson);
  } catch {
    json = null;
  }

  const existing = d.originalHandle ? await getPolicy(d.originalHandle) : null;
  const position = d.originalHandle ? d.position : (await listPolicies()).length;
  await upsertPolicy({ handle, title: d.title, body: { json, html: d.bodyHtml }, position });
  if (existing && d.originalHandle !== handle) await deletePolicy(d.originalHandle);

  await audit(user.email, existing ? "policy.update" : "policy.create", `policies/${handle}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Page légale enregistrée.", redirectTo: d.originalHandle === handle ? undefined : `/admin/politiques/${handle}` };
}

export async function deletePolicyAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const handle = String(formData.get("handle") ?? "");
  if (!handle) return failed("Page inconnue");
  await deletePolicy(handle);
  await audit(user.email, "policy.delete", `policies/${handle}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Page légale supprimée.", redirectTo: "/admin/politiques" };
}
