"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deletePromo, getPromo, setPromoActive, upsertPromo } from "@/lib/db/promos";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { parseEuroToCents } from "@/lib/domain/money";
import { PromoType } from "@/lib/domain/types";

/*
 * Codes promo maison (voir lib/promos/engine.ts). Les codes influenceurs se gèrent
 * dans l'onglet Influenceurs : on refuse ici de les écraser.
 */

const Input = z.object({
  originalCode: z.string().default(""),
  code: z.string().trim().min(2, "2 caractères minimum").max(24).regex(/^[A-Za-z0-9]+$/, "Lettres et chiffres uniquement"),
  description: z.string().trim().max(120).default(""),
  type: PromoType,
  value: z.string().trim().default(""),
  minimumEuros: z.string().trim().default(""),
  startAt: z.string().trim().default(""),
  endAt: z.string().trim().default(""),
  limit: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
  freeShipping: z.boolean().default(false),
  gifts: z.array(z.string()).default([]),
  stackWith: z.array(z.string()).default([]),
});

const day = (iso: string, endOfDay = false) => {
  const d = new Date(`${iso}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

export async function savePromoAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const gifts = formData.getAll("gifts").map(String).filter(Boolean);
  const stackWith = formData.getAll("stackWith").map(String).filter(Boolean);
  formData.delete("gifts");
  formData.delete("stackWith");
  const parsed = parseForm(Input, formData, { numbers: ["limit"], booleans: ["active", "freeShipping"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  // On majuscule les codes, mais pas le marqueur spécial « __influ ».
  const d = { ...parsed.data, gifts, stackWith: stackWith.map((c) => (c.toLowerCase() === "__influ" ? "__influ" : c.toUpperCase())) };
  const code = d.code.toUpperCase();

  let amount = 0;
  try {
    if (d.type === "percent") {
      amount = Math.round(Number(d.value.replace(",", ".")));
      if (!Number.isFinite(amount) || amount < 1 || amount > 100) return failed("Le pourcentage doit être entre 1 et 100.", { value: "Entre 1 et 100" });
    } else if (d.type === "fixed") {
      amount = parseEuroToCents(d.value);
      if (amount <= 0) return failed("Le montant doit être positif.", { value: "Montant invalide" });
    }
  } catch {
    return failed("Valeur invalide.", { value: "Montant invalide" });
  }
  if (d.type === "gift" && gifts.length === 0) return failed("Choisissez au moins un produit offert.", { gifts: "Requis" });
  let minimum = 0;
  try {
    minimum = d.minimumEuros ? parseEuroToCents(d.minimumEuros) : 0;
  } catch {
    return failed("Panier minimum invalide.", { minimumEuros: "Montant invalide" });
  }
  const startAt = d.startAt ? day(d.startAt) : Date.now();
  const endAt = d.endAt ? day(d.endAt, true) : undefined;
  if (startAt === null || endAt === null) return failed("Date invalide.");
  if (endAt && endAt < startAt) return failed("La fin est avant le début.", { endAt: "Date invalide" });

  const existing = await getPromo(code);
  if (existing?.influencerId) return failed(`${code} est le code d'un influenceur : modifiez-le dans l'onglet Influenceurs.`, { code: "Code influenceur" });
  if (existing && d.originalCode.toUpperCase() !== code) return failed(`Le code ${code} existe déjà.`, { code: "Déjà utilisé" });

  // Le type « livraison » offre déjà le port : la case est sans objet pour lui.
  const freeShipping = d.type === "free_shipping" ? false : d.freeShipping;
  await upsertPromo({ code, description: d.description, type: d.type, amount, minimum, startAt, endAt, limit: d.limit, perCustomer: 1, stackWith: d.stackWith.filter((c) => c !== code), gifts: d.type === "gift" ? gifts : [], freeShipping, active: d.active, influencerId: undefined });
  if (d.originalCode && d.originalCode.toUpperCase() !== code) await deletePromo(d.originalCode);
  await audit(user.email, existing ? "promo.update" : "promo.create", `promos/${code}`);
  revalidatePath("/admin/codes-promo");
  return { ok: true, message: `Code ${code} enregistré.`, redirectTo: `/admin/codes-promo?code=${code}` };
}

export async function togglePromoAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const code = String(formData.get("code") ?? "").toUpperCase();
  const promo = await getPromo(code);
  if (!promo) return failed("Code introuvable");
  await setPromoActive(code, !promo.active);
  await audit(user.email, promo.active ? "promo.deactivate" : "promo.activate", `promos/${code}`);
  revalidatePath("/admin/codes-promo");
  return saved(promo.active ? `Code ${code} désactivé.` : `Code ${code} activé.`);
}

/*
 * Offre « collection complète » (un livre offert) : réglage automatique, sans code. Cet
 * interrupteur bascule settings.promos.collectionOffer.enabled. Quand il est actif, la
 * remise s'applique toute seule au panier/paiement, et l'encart « Précommander la
 * collection » et le bloc « Compléter la collection » apparaissent sur le site.
 */
export async function setCollectionOfferAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  const settings = await getSettings();
  const enabled = !settings.promos.collectionOffer.enabled;
  await saveSettings({ ...settings, promos: { ...settings.promos, collectionOffer: { enabled } } });
  await audit(user.email, "settings.collectionOffer", "settings/site", enabled ? "on" : "off");
  revalidatePath("/admin/codes-promo");
  revalidatePath("/", "layout");
  return saved(enabled ? "Offre collection activée." : "Offre collection désactivée.");
}

export async function deletePromoAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const code = String(formData.get("code") ?? "").toUpperCase();
  const promo = await getPromo(code);
  if (!promo) return failed("Code introuvable");
  if (promo.influencerId) return failed("Ce code appartient à un influenceur : supprimez l'influenceur.");
  await deletePromo(code);
  await audit(user.email, "promo.delete", `promos/${code}`);
  revalidatePath("/admin/codes-promo");
  return { ok: true, message: `Code ${code} supprimé.`, redirectTo: "/admin/codes-promo" };
}
