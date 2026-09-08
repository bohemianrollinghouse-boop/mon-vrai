"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteInfluencer, getInfluencer, getInfluencerBySlug, getPromo, upsertInfluencer } from "@/lib/db/promos";
import { slugify } from "@/lib/domain/slug";
import { Platform } from "@/lib/domain/types";

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1, "Nom requis").max(80),
  handle: z.string().trim().max(80).default(""),
  platform: Platform.default("Instagram"),
  slug: z.string().trim().max(40).default(""),
  code: z.string().trim().min(2, "2 caractères minimum").max(24).regex(/^[A-Za-z0-9]+$/, "Lettres et chiffres uniquement"),
  discount: z.number().int().min(0).max(100).default(10),
  rate: z.number().int().min(0).max(100).default(10),
  endAt: z.string().trim().default(""),
  active: z.boolean().default(true),
});

export async function saveInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["discount", "rate"], booleans: ["active"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  const code = d.code.toUpperCase();
  const slug = slugify(d.slug || d.code);
  if (!slug) return failed("Identifiant de lien invalide.", { slug: "Invalide" });

  const existing = d.id ? await getInfluencer(d.id) : null;
  const bySlug = await getInfluencerBySlug(slug);
  if (bySlug && bySlug.id !== existing?.id) return failed(`Le lien « ${slug} » est déjà pris par ${bySlug.name}.`, { slug: "Déjà utilisé" });
  const promo = await getPromo(code);
  if (promo && promo.influencerId !== existing?.id) return failed(`Le code ${code} existe déjà${promo.influencerId ? " (autre influenceur)" : " (code promo interne)"}.`, { code: "Déjà utilisé" });
  const endAt = d.endAt ? new Date(`${d.endAt}T23:59:59`).getTime() : undefined;
  if (endAt !== undefined && Number.isNaN(endAt)) return failed("Date de fin invalide.", { endAt: "Date invalide" });

  const saved_ = await upsertInfluencer({ id: existing?.id, name: d.name, handle: d.handle, platform: d.platform, slug, code, discount: d.discount, rate: d.rate, endAt, active: d.active });
  await audit(user.email, existing ? "influencer.update" : "influencer.create", `influencers/${saved_.id}`, `${saved_.name} · ${code}`);
  revalidatePath("/admin/influenceurs");
  revalidatePath("/admin/codes-promo");
  return { ok: true, message: `${saved_.name} enregistré${existing ? "" : " · code " + code + " actif"}.`, redirectTo: `/admin/influenceurs?id=${saved_.id}` };
}

export async function toggleInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const inf = await getInfluencer(id);
  if (!inf) return failed("Influenceur introuvable");
  await upsertInfluencer({ ...inf, active: !inf.active });
  await audit(user.email, inf.active ? "influencer.pause" : "influencer.activate", `influencers/${id}`);
  revalidatePath("/admin/influenceurs");
  return saved(inf.active ? `${inf.name} en pause : code et lien inactifs.` : `${inf.name} réactivé.`);
}

export async function deleteInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const inf = await getInfluencer(id);
  if (!inf) return failed("Influenceur introuvable");
  await deleteInfluencer(id);
  await audit(user.email, "influencer.delete", `influencers/${id}`, inf.name);
  revalidatePath("/admin/influenceurs");
  return { ok: true, message: `${inf.name} supprimé (les ventes passées restent attribuées).`, redirectTo: "/admin/influenceurs" };
}
