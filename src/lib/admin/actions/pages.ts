"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deletePage, getPage, upsertPage } from "@/lib/db/pages";
import { slugify } from "@/lib/domain/slug";
import { Slug, Status } from "@/lib/domain/types";

/*
 * Pages libres, rédigées avec l'éditeur. Le HTML est celui produit par Tiptap côté
 * client : on le garde tel quel car seuls des administrateurs authentifiés peuvent
 * l'écrire — un visiteur ne passe jamais par ici.
 */

const Input = z.object({
  originalSlug: z.string().default(""),
  slug: z.string().trim().default(""),
  title: z.string().trim().min(1, "Le titre est requis").max(120),
  bodyHtml: z.string().default(""),
  bodyJson: z.string().default("null"),
  status: Status.default("draft"),
  seoTitle: z.string().trim().max(70).default(""),
  seoDescription: z.string().trim().max(200).default(""),
});

export async function savePageAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const slugResult = Slug.safeParse(d.slug ? slugify(d.slug) : slugify(d.title));
  if (!slugResult.success) return failed("Adresse invalide", { slug: "Minuscules, chiffres et tirets" });
  const slug = slugResult.data;
  if (slug !== d.originalSlug && (await getPage(slug))) return failed(`Une page existe déjà à « ${slug} »`, { slug: "Déjà utilisée" });

  let json: unknown = null;
  try {
    json = JSON.parse(d.bodyJson);
  } catch {
    json = null;
  }

  const existing = d.originalSlug ? await getPage(d.originalSlug) : null;
  await upsertPage({
    slug,
    title: d.title,
    body: { json, html: d.bodyHtml },
    status: d.status,
    seo: { title: d.seoTitle || undefined, description: d.seoDescription || undefined },
  });
  if (existing && d.originalSlug !== slug) await deletePage(d.originalSlug);

  await audit(user.email, existing ? "page.update" : "page.create", `pages/${slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Page enregistrée.", redirectTo: d.originalSlug === slug ? undefined : `/admin/pages/${slug}` };
}

export async function deletePageAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return failed("Page inconnue");
  await deletePage(slug);
  await audit(user.email, "page.delete", `pages/${slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Page supprimée.", redirectTo: "/admin/pages" };
}
