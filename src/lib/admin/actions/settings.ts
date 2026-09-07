"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { parseEuroToCents } from "@/lib/domain/money";
import { slugify } from "@/lib/domain/slug";
import { SiteSettings } from "@/lib/domain/types";

/*
 * Réglages du site. Le formulaire envoie les champs en chemin (`announcement.text`…) ;
 * le schéma SiteSettings valide l'ensemble. L'adresse postale arrive en texte multi-ligne
 * et le seuil de livraison en euros : les deux sont convertis ici, jamais dans la vue.
 */

const boolish = z.union([z.boolean(), z.string()]).default(false).transform((v) => v === true || v === "true" || v === "on");

const Input = SiteSettings.omit({ updatedAt: true, contact: true, shipping: true, socials: true, legal: true, payments: true }).extend({
  payments: z.object({ testMode: z.boolean().default(false) }),
  legal: z.object({
    footerLine: z.string().trim().default(""),
    sellerName: z.string().trim().default(""),
    sellerAddress: z.string().default(""),
    siret: z.string().trim().default(""),
    vatNumber: z.string().trim().default(""),
    vatNote: z.string().trim().default(""),
  }),
  contact: z.object({
    email: z.string().trim().default(""),
    phone: z.string().trim().default(""),
    address: z.string().default(""),
  }),
  socials: z.object({
    instagram: z.string().trim().default(""),
    tiktok: z.string().trim().default(""),
    facebook: z.string().trim().default(""),
  }),
  shipping: z.object({
    freeThresholdEuros: z.number().min(0).default(0),
    preorderShipFrom: z.string().default(""),
    countries: z.string().default("FR, BE, LU"),
    rates: z
      .array(
        z.object({
          id: z.string().trim().default(""),
          name: z.string().trim().max(60).default(""),
          description: z.string().trim().max(80).default(""),
          priceEuros: z.string().trim().default(""),
          // Dans une liste, une case à cocher arrive en "true"/"false" (champ caché + case), pas en booléen.
          freeAboveThreshold: boolish,
          enabled: boolish,
        }),
      )
      .default([]),
  }),
  inventory: z.object({ lowThreshold: z.number().int().min(0).default(20) }),
});

export async function saveSettingsAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, {
    booleans: ["announcement.enabled", "payments.testMode"],
    numbers: ["shipping.freeThresholdEuros", "inventory.lowThreshold"],
  });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const current = await getSettings();
  for (const r of d.shipping.rates) {
    if (r.name && r.priceEuros) {
      try {
        parseEuroToCents(r.priceEuros);
      } catch {
        return failed(`Prix invalide pour « ${r.name} »`);
      }
    }
  }
  const next = SiteSettings.safeParse({
    ...current,
    ...d,
    contact: {
      email: d.contact.email || undefined,
      phone: d.contact.phone || undefined,
      addressLines: d.contact.address.split("\n").map((l) => l.trim()).filter(Boolean),
    },
    socials: {
      instagram: d.socials.instagram || undefined,
      tiktok: d.socials.tiktok || undefined,
      facebook: d.socials.facebook || undefined,
    },
    payments: { mode: d.payments.testMode ? "test" : "live" },
    legal: {
      ...d.legal,
      sellerAddressLines: d.legal.sellerAddress.split("\n").map((l) => l.trim()).filter(Boolean),
    },
    shipping: {
      freeThreshold: Math.round(d.shipping.freeThresholdEuros * 100),
      preorderShipFrom: d.shipping.preorderShipFrom || undefined,
      countries: d.shipping.countries.split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
      // Une ligne sans nom est une ligne laissée vide : on l'ignore.
      rates: d.shipping.rates
        .filter((r) => r.name)
        .map((r, i) => ({
          id: r.id || slugify(r.name) || `tarif-${i + 1}`,
          name: r.name,
          description: r.description,
          price: r.priceEuros ? parseEuroToCents(r.priceEuros) : 0,
          freeAboveThreshold: r.freeAboveThreshold,
          enabled: r.enabled,
        })),
    },
    inventory: d.inventory,
    updatedAt: Date.now(),
  });
  if (!next.success) return failed(next.error.issues[0]?.message ?? "Réglages invalides");

  await saveSettings(next.data);
  const modeChanged = current.payments.mode !== next.data.payments.mode;
  await audit(user.email, "settings.save", "settings/site", modeChanged ? `paiements → ${next.data.payments.mode}` : undefined);
  revalidatePath("/", "layout");
  return saved("Réglages enregistrés.");
}
