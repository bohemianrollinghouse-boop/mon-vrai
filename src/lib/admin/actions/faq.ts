"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getContactContent, saveContactContent } from "@/lib/db/content";
import { ContactContent } from "@/lib/domain/types";

/*
 * FAQ : les questions vivent dans le contenu de la page Contact (`faq.items`). Chaque
 * action relit le document, applique un changement sur une question, réécrit le tout —
 * la liste est courte, une transaction serait du zèle.
 */

async function load() {
  const content = await getContactContent();
  if (!content) throw new Error("Contenu Contact introuvable : lancez le seed.");
  return content;
}

async function persist(content: ContactContent, items: ContactContent["faq"]["items"]) {
  const { updatedAt: _u, ...rest } = content;
  void _u;
  await saveContactContent(ContactContent.omit({ updatedAt: true }).parse({ ...rest, faq: { ...content.faq, items } }));
  revalidatePath("/contact");
  revalidatePath("/admin/faq");
}

const Save = z.object({
  index: z.number().int().min(-1),
  cat: z.string().trim().max(40).default(""),
  q: z.string().trim().min(1, "La question est vide").max(200),
  a: z.string().trim().min(1, "La réponse est vide").max(800),
  hidden: z.boolean().default(false),
});

/** Crée (index = -1) ou modifie une question. */
export async function saveFaqItemAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Save, formData, { numbers: ["index"], booleans: ["hidden"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const { index, ...item } = parsed.data;
  const content = await load();
  const items = [...content.faq.items];
  if (index >= 0 && index < items.length) items[index] = item;
  else items.push(item);
  if (items.length > 30) return failed("30 questions maximum.");
  await persist(content, items);
  await audit(user.email, index >= 0 ? "faq.update" : "faq.create", "content/contact", item.q);
  const at = index >= 0 ? index : items.length - 1;
  return { ok: true, message: index >= 0 ? "Question enregistrée." : "Question ajoutée.", redirectTo: `/admin/faq?q=${at}` };
}

const Index = z.object({ index: z.number().int().min(0) });

export async function toggleFaqItemAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Index, formData, { numbers: ["index"] });
  if (!parsed.ok) return failed(parsed.error);
  const content = await load();
  const items = content.faq.items.map((f, i) => (i === parsed.data.index ? { ...f, hidden: !f.hidden } : f));
  await persist(content, items);
  await audit(user.email, "faq.toggle", "content/contact", String(parsed.data.index));
  return saved(items[parsed.data.index]?.hidden ? "Question masquée." : "Question visible.");
}

export async function deleteFaqItemAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Index, formData, { numbers: ["index"] });
  if (!parsed.ok) return failed(parsed.error);
  const content = await load();
  await persist(content, content.faq.items.filter((_, i) => i !== parsed.data.index));
  await audit(user.email, "faq.delete", "content/contact", String(parsed.data.index));
  return { ok: true, message: "Question supprimée.", redirectTo: "/admin/faq" };
}

const Move = z.object({ index: z.number().int().min(0), dir: z.number().int() });

export async function moveFaqItemAction(formData: FormData): Promise<AdminResult> {
  await assertAdmin();
  const parsed = parseForm(Move, formData, { numbers: ["index", "dir"] });
  if (!parsed.ok) return failed(parsed.error);
  const content = await load();
  const items = [...content.faq.items];
  const i = parsed.data.index;
  const j = i + (parsed.data.dir < 0 ? -1 : 1);
  if (j < 0 || j >= items.length) return saved("Déjà en bout de liste.");
  [items[i], items[j]] = [items[j], items[i]];
  await persist(content, items);
  return { ok: true, message: "Ordre modifié.", redirectTo: `/admin/faq?q=${j}` };
}
