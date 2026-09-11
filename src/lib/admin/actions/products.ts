"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { uploadMedia } from "@/lib/db/media";
import { deleteProduct, getProduct, upsertProduct } from "@/lib/db/products";
import { parseEuroToCents } from "@/lib/domain/money";
import { slugify } from "@/lib/domain/slug";
import { Badge, ImageRef, Slug, Status, Tint } from "@/lib/domain/types";

/*
 * Produits. Le formulaire porte les champs simples ; les images existantes arrivent en
 * JSON (ordre et alt éditables), les nouvelles en fichiers. Le prix est saisi en euros
 * et converti ici, jamais stocké en flottant.
 */

const Input = z.object({
  originalSlug: z.string().default(""),
  slug: z.string().trim().default(""),
  title: z.string().trim().min(1, "Le titre est requis").max(120),
  ageLabel: z.string().trim().max(40).default("6-18 mois"),
  subtitle: z.string().trim().max(200).default(""),
  descriptionHtml: z.string().default(""),
  items: z.string().default(""),
  price: z.string().trim().min(1, "Le prix est requis"),
  compareAtPrice: z.string().trim().default(""),
  weightG: z.number().int().min(1).default(100),
  badge: Badge.default("none"),
  tint: Tint.default("green"),
  preorderEnabled: z.boolean().default(false),
  preorderShipFrom: z.string().default(""),
  stockTracked: z.boolean().default(false),
  stock: z.number().int().min(0).optional(),
  isbn: z.string().trim().max(20).default(""),
  position: z.number().int().default(0),
  status: Status.default("draft"),
  seoTitle: z.string().trim().max(70).default(""),
  seoDescription: z.string().trim().max(200).default(""),
  imagesJson: z.string().default("[]"),
});

export async function saveProductAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, {
    booleans: ["preorderEnabled", "stockTracked"],
    numbers: ["stock", "position", "weightG"],
  });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const slugResult = Slug.safeParse(d.slug ? slugify(d.slug) : slugify(d.title));
  if (!slugResult.success) return failed("Slug invalide", { slug: "Minuscules, chiffres et tirets uniquement" });
  const slug = slugResult.data;

  if (slug !== d.originalSlug && (await getProduct(slug))) {
    return failed(`Un produit existe déjà avec l'adresse « ${slug} »`, { slug: "Déjà utilisé" });
  }

  let price: number, compareAtPrice: number | undefined;
  try {
    price = parseEuroToCents(d.price);
    compareAtPrice = d.compareAtPrice ? parseEuroToCents(d.compareAtPrice) : undefined;
  } catch (e) {
    return failed((e as Error).message, { price: "Montant invalide" });
  }

  let parsedImages: unknown;
  try {
    parsedImages = JSON.parse(d.imagesJson || "[]");
  } catch {
    return failed("Liste d'images illisible");
  }
  const kept = z.array(ImageRef).safeParse(parsedImages);
  if (!kept.success) return failed("Liste d'images invalide");
  const images = [...kept.data];
  for (const file of formData.getAll("newImages")) {
    if (!(file instanceof File) || file.size === 0) continue;
    // uploadMedia refuse un type ou une taille : c'est une erreur de saisie, pas une
    // panne — elle doit revenir dans le formulaire, pas en erreur serveur.
    try {
      const media = await uploadMedia({ bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, filename: file.name, alt: d.title });
      images.push({ url: media.url, alt: media.alt, width: media.width, height: media.height });
    } catch (e) {
      return failed(`${file.name} : ${(e as Error).message}`, { newImages: "Photo refusée" });
    }
  }

  const existing = d.originalSlug ? await getProduct(d.originalSlug) : null;
  await upsertProduct({
    slug,
    title: d.title,
    ageLabel: d.ageLabel || "6-18 mois",
    subtitle: d.subtitle,
    descriptionHtml: d.descriptionHtml,
    items: d.items.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean),
    price,
    compareAtPrice,
    weightG: d.weightG,
    images,
    badge: d.badge,
    tint: d.tint,
    preorder: { enabled: d.preorderEnabled, shipFrom: d.preorderShipFrom || undefined },
    stock: d.stockTracked ? (d.stock ?? 0) : null,
    isbn: d.isbn || undefined,
    position: d.position,
    status: d.status,
    seo: { title: d.seoTitle || undefined, description: d.seoDescription || undefined },
  });

  // Renommage d'adresse : l'ancien document disparaît pour ne pas laisser de doublon.
  if (existing && d.originalSlug !== slug) await deleteProduct(d.originalSlug);

  await audit(user.email, existing ? "product.update" : "product.create", `products/${slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Produit enregistré.", redirectTo: d.originalSlug === slug ? undefined : `/admin/produits/${slug}` };
}

export async function deleteProductAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return failed("Produit inconnu");
  await deleteProduct(slug);
  await audit(user.email, "product.delete", `products/${slug}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Produit supprimé.", redirectTo: "/admin/produits" };
}
