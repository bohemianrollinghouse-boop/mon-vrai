"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { saveCatalogueContent, saveContactContent, saveHomeContent, saveStoryContent } from "@/lib/db/content";
import { CatalogueContent, ContactContent, HomeContent, StoryContent, type ImageRef } from "@/lib/domain/types";

/*
 * Contenus structurés des pages système. Les formulaires nomment leurs champs en chemin
 * (`hero.heading`, `tiles[0].title`) : parseForm reconstruit l'objet, le schéma du
 * domaine le valide. Les images sont saisies par URL (copiée depuis la médiathèque) ;
 * une URL vide retire l'image.
 */

/** Une URL d'image saisie dans un champ texte → ImageRef ou undefined. */
const ImageUrl = z
  .string()
  .trim()
  .default("")
  .transform((url): ImageRef | undefined => (url ? { url, alt: "" } : undefined))
  .pipe(z.custom<ImageRef | undefined>());

const HomeInput = HomeContent.omit({ updatedAt: true, howTo: true, story: true }).extend({
  howTo: HomeContent.shape.howTo.omit({ image: true }).extend({ image: ImageUrl }),
  story: HomeContent.shape.story.omit({ image: true }).extend({ image: ImageUrl }),
});

export async function saveHomeAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(HomeInput, formData, { numbers: ["catalogue.count"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  await saveHomeContent(parsed.data);
  await audit(user.email, "content.home.save", "content/home");
  revalidatePath("/");
  return saved("Accueil enregistré.");
}

const CatalogueInput = CatalogueContent.omit({ updatedAt: true });

export async function saveCatalogueAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(CatalogueInput, formData, { booleans: ["offer.enabled"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  await saveCatalogueContent(parsed.data);
  await audit(user.email, "content.catalogue.save", "content/catalogue");
  revalidatePath("/catalogue");
  return saved("Catalogue enregistré.");
}

const StoryInput = StoryContent.omit({ updatedAt: true, hero: true, gallery: true, intro: true, walk: true }).extend({
  hero: StoryContent.shape.hero.omit({ image: true }).extend({ image: ImageUrl }),
  galleryUrls: z.string().default(""),
  intro: z.object({ heading: z.string().max(120), paragraphs: z.string() }),
  walk: z.object({ heading: z.string().max(120), paragraphs: z.string() }),
});

export async function saveStoryAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(StoryInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  const result = StoryContent.omit({ updatedAt: true }).safeParse({
    ...d,
    intro: { heading: d.intro.heading, paragraphs: splitParagraphs(d.intro.paragraphs) },
    walk: { heading: d.walk.heading, paragraphs: splitParagraphs(d.walk.paragraphs) },
    gallery: d.galleryUrls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean).map((url) => ({ url, alt: "" })),
  });
  if (!result.success) return failed(result.error.issues[0]?.message ?? "Contenu invalide");
  await saveStoryContent(result.data);
  await audit(user.email, "content.story.save", "content/story");
  revalidatePath("/notre-histoire");
  return saved("Notre histoire enregistrée.");
}

const ContactInput = ContactContent.omit({ updatedAt: true, subjects: true, faq: true }).extend({
  subjectsText: z.string().default(""),
  faq: z.object({
    heading: z.string().max(120).default(""),
    note: z.string().max(60).default(""),
    items: z.array(z.object({ q: z.string().max(200).default(""), a: z.string().max(800).default("") })).default([]),
  }),
});

export async function saveContactAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(ContactInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  const result = ContactContent.omit({ updatedAt: true }).safeParse({
    ...d,
    subjects: d.subjectsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    // Une question vide est une ligne laissée en blanc dans le formulaire : on l'ignore.
    faq: { ...d.faq, items: d.faq.items.filter((i) => i.q.trim() && i.a.trim()) },
  });
  if (!result.success) return failed(result.error.issues[0]?.message ?? "Contenu invalide");
  await saveContactContent(result.data);
  await audit(user.email, "content.contact.save", "content/contact");
  revalidatePath("/contact");
  return saved("Contact enregistré.");
}

function splitParagraphs(text: string): string[] {
  return text.split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
}
