"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { parseEuroToCents } from "@/lib/domain/money";
import { getStripe } from "@/lib/stripe/client";

/*
 * Codes promo = coupons + « promotion codes » Stripe, dans le mode de paiement courant
 * (test ou production : les deux jeux sont indépendants). La caisse les résout via
 * l'API Stripe ; ici on les crée, on les active, on les désactive. Rien en base à nous.
 */

async function stripeForMode() {
  const settings = await getSettings();
  const stripe = getStripe(settings.payments.mode);
  if (!stripe) throw new Error(`Stripe (${settings.payments.mode}) n'est pas configuré.`);
  return { stripe, mode: settings.payments.mode };
}

const Create = z.object({
  code: z
    .string()
    .trim()
    .min(3, "3 caractères minimum")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Lettres, chiffres et tirets uniquement"),
  name: z.string().trim().max(60).default(""),
  kind: z.enum(["percent", "amount"]),
  value: z.string().trim().min(1, "Valeur requise"),
  minimumEuros: z.string().trim().default(""),
  expiresAt: z.string().trim().default(""),
  maxRedemptions: z.number().int().min(1).optional(),
});

export async function createPromoAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Create, formData, { numbers: ["maxRedemptions"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  const code = d.code.toUpperCase();

  let percent: number | undefined;
  let amount: number | undefined;
  let minimum: number | undefined;
  try {
    if (d.kind === "percent") {
      percent = Number(d.value.replace(",", "."));
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return failed("Le pourcentage doit être entre 1 et 100.", { value: "Entre 1 et 100" });
    } else {
      amount = parseEuroToCents(d.value);
      if (amount <= 0) return failed("Le montant doit être positif.", { value: "Montant invalide" });
    }
    if (d.minimumEuros) minimum = parseEuroToCents(d.minimumEuros);
  } catch (e) {
    return failed((e as Error).message, { value: "Montant invalide" });
  }
  const expires = d.expiresAt ? Math.floor(new Date(`${d.expiresAt}T23:59:59`).getTime() / 1000) : undefined;
  if (expires !== undefined && (Number.isNaN(expires) || expires * 1000 < Date.now())) return failed("La date d'expiration est passée.", { expiresAt: "Date invalide" });

  try {
    const { stripe, mode } = await stripeForMode();
    const existing = await stripe.promotionCodes.list({ code, limit: 1 });
    if (existing.data[0]?.active) return failed(`Le code ${code} existe déjà et est actif.`, { code: "Déjà utilisé" });

    const coupon = await stripe.coupons.create({
      name: d.name || code,
      duration: "once",
      ...(percent !== undefined ? { percent_off: percent } : { amount_off: amount, currency: "eur" }),
      ...(expires ? { redeem_by: expires } : {}),
      metadata: { source: "monvrai-admin", code },
    });
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code,
      active: true,
      ...(expires ? { expires_at: expires } : {}),
      ...(d.maxRedemptions ? { max_redemptions: d.maxRedemptions } : {}),
      ...(minimum ? { restrictions: { minimum_amount: minimum, minimum_amount_currency: "eur" } } : {}),
      metadata: { source: "monvrai-admin" },
    });
    await audit(user.email, "promo.create", `stripe/${promo.id}`, `${code} (${mode})`);
    revalidatePath("/admin/codes-promo");
    return saved(`Code ${code} créé (${mode === "test" ? "mode test" : "production"}).`);
  } catch (e) {
    return failed(`Stripe : ${(e as Error).message}`);
  }
}

const Toggle = z.object({ id: z.string().min(1), active: z.enum(["true", "false"]) });

export async function togglePromoAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Toggle, formData);
  if (!parsed.ok) return failed(parsed.error);
  try {
    const { stripe } = await stripeForMode();
    const promo = await stripe.promotionCodes.update(parsed.data.id, { active: parsed.data.active === "true" });
    await audit(user.email, promo.active ? "promo.activate" : "promo.deactivate", `stripe/${promo.id}`, promo.code);
    revalidatePath("/admin/codes-promo");
    return saved(promo.active ? `Code ${promo.code} réactivé.` : `Code ${promo.code} désactivé : il ne fonctionne plus à la caisse.`);
  } catch (e) {
    return failed(`Stripe : ${(e as Error).message}`);
  }
}
