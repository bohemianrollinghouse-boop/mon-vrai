"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deletePage, getPage, savePageBlocks, savePageSeo, setHomePage, upsertPage } from "@/lib/db/pages";
import { slugifyPath } from "@/lib/domain/slug";
import { BlockDocument, ImageRef, PagePath, Status } from "@/lib/domain/types";
import { PINNED_SLUGS, isReservedPath } from "@/lib/domain/system-pages";

/*
 * Pages libres. Trois formulaires, trois actions — publication, contenu, SEO — parce
 * que l'éditeur de blocs ne peut pas vivre dans un <form> (les boutons de Puck le
 * soumettraient), et que le SEO est placé après lui. Chacune relit la page et ne
 * réécrit que ses propres champs.
 */

const Input = z.object({
  originalSlug: z.string().default(""),
  slug: z.string().trim().default(""),
  title: z.string().trim().min(1, "Le titre est requis").max(120),
  status: Status.default("draft"),
  category: z.string().trim().max(40).default(""),
});

const SeoInput = z.object({
  slug: z.string().trim().min(1),
  seoTitle: z.string().trim().max(70, "70 caractères maximum").default(""),
  seoDescription: z.string().trim().max(200, "200 caractères maximum").default(""),
  shareTitle: z.string().trim().max(90, "90 caractères maximum").default(""),
  shareDescription: z.string().trim().max(300, "300 caractères maximum").default(""),
  /** L'image de partage voyage en JSON : un ImageRef n'est pas un champ de formulaire. */
  seoImage: z.string().default(""),
  canonical: z.string().trim().default(""),
  noindex: z.boolean().default(false),
});

export async function savePageAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  // L'adresse est le chemin réel de la page : « notre-histoire » donne /notre-histoire.
  const slugResult = PagePath.safeParse(slugifyPath(d.slug || d.title));
  if (!slugResult.success) return failed("Adresse invalide", { slug: "Minuscules, chiffres, tirets et barres obliques" });
  const slug = slugResult.data;
  if (isReservedPath(slug)) {
    return failed(`« ${slug.split("/")[0]} » est une adresse réservée par le site`, { slug: "Ce début d'adresse est déjà pris par une route du site" });
  }
  // Le panier vide, la page 404 et le fil d'Ariane d'un livre pointent vers ces
  // adresses en dur : les renommer casserait ces liens sans prévenir.
  if (d.originalSlug && PINNED_SLUGS.has(d.originalSlug) && slug !== d.originalSlug) {
    return failed(`L'adresse « ${d.originalSlug} » est utilisée par le site lui-même et ne peut pas changer`, { slug: "Adresse imposée" });
  }
  if (slug !== d.originalSlug && (await getPage(slug))) return failed(`Une page existe déjà à « ${slug} »`, { slug: "Déjà utilisée" });

  const existing = d.originalSlug ? await getPage(d.originalSlug) : null;
  await upsertPage({
    slug,
    title: d.title,
    status: d.status,
    category: d.category,
  });
  if (existing && d.originalSlug !== slug) await deletePage(d.originalSlug);

  await audit(user.email, existing ? "page.update" : "page.create", `pages/${slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Publication enregistrée.", redirectTo: d.originalSlug === slug ? undefined : `/admin/pages/${slug}` };
}

export async function deletePageAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return failed("Page inconnue");
  await deletePage(slug);
  await audit(user.email, "page.delete", `pages/${slug}`);
  revalidatePath("/", "layout");
  /*
   * Redirection côté serveur, et non `redirectTo` : une action serveur invalide la
   * route courante, qui est ici la fiche qu'on vient de supprimer — elle se rendait
   * en 404 avant que la redirection n'aboutisse. `redirect()` coupe court.
   */
  redirect("/admin/pages");
}

/*
 * Contenu de la page. Le document vient du client : il est revalidé par BlockDocument
 * avant écriture, comme toute entrée publique. Le catalogue de blocs n'est pas
 * vérifié ici — un type inconnu est simplement ignoré au rendu.
 */
export async function savePageBlocksAction(slug: string, data: unknown): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = BlockDocument.safeParse(data);
  if (!parsed.success) return failed("Document de blocs invalide");

  const page = await savePageBlocks(slug, parsed.data);
  if (!page) return failed("Page inconnue");

  await audit(user.email, "page.blocks", `pages/${slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Contenu enregistré." };
}


/** Référencement de la page : son propre formulaire, sous le contenu. */
export async function savePageSeoAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(SeoInput, formData, { booleans: ["noindex"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  let image: ImageRef | undefined;
  if (d.seoImage) {
    const ref = ImageRef.safeParse(JSON.parse(d.seoImage) as unknown);
    if (!ref.success) return failed("Image de partage invalide");
    image = ref.data;
  }
  if (d.canonical && !z.url().safeParse(d.canonical).success) {
    return failed("Adresse canonique invalide", { canonical: "Une URL complète, https:// comprise" });
  }

  const page = await savePageSeo(d.slug, {
    title: d.seoTitle || undefined,
    description: d.seoDescription || undefined,
    shareTitle: d.shareTitle || undefined,
    shareDescription: d.shareDescription || undefined,
    image,
    canonical: d.canonical || undefined,
    noindex: d.noindex,
  });
  if (!page) return failed("Page inconnue");

  await audit(user.email, "page.seo", `pages/${d.slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Référencement enregistré." };
}

/*
 * Désigne (ou libère) la page servie à la racine du site. Une seule page à la fois :
 * setHomePage retire le drapeau des autres dans le même lot. Sans page désignée, la
 * racine retombe sur l'accueil historique (`content/home`).
 */
export async function setHomePageAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  const makeHome = String(formData.get("home") ?? "") === "true";
  if (!slug) return failed("Page inconnue");

  const page = await getPage(slug);
  if (!page) return failed("Page inconnue");
  if (makeHome && page.status !== "published") return failed("Publiez la page avant d'en faire l'accueil");

  await setHomePage(makeHome ? slug : "");
  await audit(user.email, "page.home", `pages/${slug}`, makeHome ? "accueil" : "retirée");
  revalidatePath("/", "layout");
  return { ok: true, message: makeHome ? "Cette page est désormais l'accueil du site." : "Cette page n'est plus l'accueil." };
}
