"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { findOffer } from "@/lib/boxtal/offers";
import { parseEuroToCents } from "@/lib/domain/money";
import { slugify } from "@/lib/domain/slug";
import { SiteSettings } from "@/lib/domain/types";

/*
 * Réglages du site, en deux formulaires : les réglages généraux (/admin/reglages) et la
 * livraison (/admin/livraison). Les champs arrivent en chemin (`announcement.text`…) et
 * le schéma SiteSettings valide l'ensemble. L'adresse postale arrive en texte multi-ligne
 * et le seuil de livraison en euros : les deux sont convertis ici, jamais dans la vue.
 * Chaque action relit les réglages courants et ne réécrit que ses propres champs.
 */

const boolish = z.union([z.boolean(), z.string()]).default(false).transform((v) => v === true || v === "true" || v === "on");

const Input = SiteSettings.omit({ updatedAt: true, contact: true, shipping: true, socials: true, legal: true, payments: true }).extend({
  // Le mode test/production n'est plus ici : il est piloté par le slider en haut de l'admin
  // (setSiteModeAction). Le formulaire de réglages ne touche que PayPal.
  payments: z.object({ paypal: z.boolean().default(false) }),
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
  // La livraison a sa propre page (/admin/livraison) et sa propre action : ici, seule
  // la date d'expédition annoncée, qui vit dans la carte « Boutique ».
  shipping: z.object({ preorderShipFrom: z.string().default("") }),
  inventory: z.object({ lowThreshold: z.number().int().min(0).default(20) }),
});

export async function saveSettingsAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, {
    booleans: ["announcement.enabled", "payments.paypal"],
    numbers: ["inventory.lowThreshold"],
  });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const current = await getSettings();
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
    // Le mode reste piloté par le slider : on préserve la valeur actuelle.
    payments: { mode: current.payments.mode, paypal: d.payments.paypal },
    legal: {
      ...d.legal,
      sellerAddressLines: d.legal.sellerAddress.split("\n").map((l) => l.trim()).filter(Boolean),
    },
    // Ce formulaire ne porte que la date de précommande : le reste de la livraison
    // vient de /admin/livraison et doit survivre à un enregistrement des réglages.
    shipping: { ...current.shipping, preorderShipFrom: d.shipping.preorderShipFrom || undefined },
    inventory: d.inventory,
    updatedAt: Date.now(),
  });
  if (!next.success) return failed(next.error.issues[0]?.message ?? "Réglages invalides");

  await saveSettings(next.data);
  await audit(user.email, "settings.save", "settings/site");
  revalidatePath("/", "layout");
  return saved("Réglages enregistrés.");
}

/*
 * Livraison (page /admin/livraison) : tarifs proposés au client, adresse d'expédition
 * et colis par défaut Boxtal. Action séparée des réglages généraux — chaque formulaire
 * ne réécrit que ses propres champs, jamais ceux de l'autre page.
 */
const ShippingInput = z.object({
  shipping: z.object({
    freeThresholdEuros: z.number().min(0).default(0),
    countries: z.string().default("FR, BE, LU"),
    rates: z
      .array(
        z.object({
          id: z.string().trim().default(""),
          name: z.string().trim().max(60).default(""),
          description: z.string().trim().max(80).default(""),
          // Prix client (chaînes en euros) par pays et par tranche de poids.
          prices: z
            .object({ FR: z.array(z.string()).default([]), BE: z.array(z.string()).default([]), LU: z.array(z.string()).default([]) })
            .default({ FR: [], BE: [], LU: [] }),
          // Offre Boxtal par pays (Chrono 13 en FR, Chrono Classic vers BE/LU).
          offerCodes: z
            .object({ FR: z.string().trim().default(""), BE: z.string().trim().default(""), LU: z.string().trim().default("") })
            .default({ FR: "", BE: "", LU: "" }),
          // Dans une liste, une case à cocher arrive en "true"/"false" (champ caché + case), pas en booléen.
          freeAboveThreshold: boolish,
          enabled: boolish,
        }),
      )
      .default([]),
    parcel: z.object({
      lengthCm: z.number().int().min(1).default(16),
      widthCm: z.number().int().min(1).default(16),
      heightCm: z.number().int().min(1).default(4),
      unitWeightG: z.number().int().min(1).default(100),
      baseWeightG: z.number().int().min(0).default(60),
      contentCategoryId: z.string().trim().default("content:v1:10150"),
      labelType: z.enum(["PDF_A4", "PDF_10x15"]).default("PDF_10x15"),
    }),
    sender: z.object({
      firstName: z.string().trim().default(""),
      lastName: z.string().trim().default(""),
      company: z.string().trim().default(""),
      street: z.string().trim().default(""),
      postalCode: z.string().trim().default(""),
      city: z.string().trim().default(""),
      country: z.string().trim().default("FR"),
      email: z.string().trim().default(""),
      phone: z.string().trim().default(""),
    }),
  }),
});

export async function saveShippingAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(ShippingInput, formData, {
    numbers: ["shipping.freeThresholdEuros", "shipping.parcel.lengthCm", "shipping.parcel.widthCm", "shipping.parcel.heightCm", "shipping.parcel.unitWeightG", "shipping.parcel.baseWeightG"],
  });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const current = await getSettings();
  for (const r of d.shipping.rates) {
    if (!r.name) continue;
    for (const c of ["FR", "BE", "LU"] as const) {
      for (const e of r.prices[c]) {
        if (!e.trim()) continue;
        try {
          parseEuroToCents(e);
        } catch {
          return failed(`Prix invalide pour « ${r.name} » (${c})`);
        }
      }
    }
  }
  const next = SiteSettings.safeParse({
    ...current,
    shipping: {
      ...current.shipping,
      freeThreshold: Math.round(d.shipping.freeThresholdEuros * 100),
      countries: d.shipping.countries.split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
      // Une ligne sans nom est une ligne laissée vide : on l'ignore.
      rates: d.shipping.rates
        .filter((r) => r.name)
        .map((r, i) => {
          const toCents = (arr: string[]) => arr.map((e) => (e.trim() ? parseEuroToCents(e) : 0));
          // Relais et réseaux découlent de l'offre Boxtal France (le service est le même pour tous les pays).
          const offer = findOffer(r.offerCodes.FR);
          return {
            id: r.id || slugify(r.name) || `tarif-${i + 1}`,
            name: r.name,
            description: r.description,
            prices: { FR: toCents(r.prices.FR), BE: toCents(r.prices.BE), LU: toCents(r.prices.LU) },
            offerCodes: { FR: r.offerCodes.FR, BE: r.offerCodes.BE, LU: r.offerCodes.LU },
            freeAboveThreshold: r.freeAboveThreshold,
            enabled: r.enabled,
            relay: offer?.relay ?? false,
            networks: offer?.networks ?? [],
          };
        }),
      parcel: d.shipping.parcel,
      sender: { ...d.shipping.sender, country: d.shipping.sender.country.toUpperCase() || "FR" },
    },
    updatedAt: Date.now(),
  });
  if (!next.success) return failed(next.error.issues[0]?.message ?? "Réglages de livraison invalides");

  await saveSettings(next.data);
  await audit(user.email, "settings.shipping", "settings/site");
  revalidatePath("/", "layout");
  return saved("Livraison enregistrée.");
}

/*
 * Bascule prod/test, par service. Le slider en haut de l'admin envoie service="both"
 * (Stripe + Boxtal ensemble) ; les interrupteurs des réglages ciblent un seul service,
 * ce qui permet un état « partiel » (ex. Stripe en test, Boxtal en production).
 */
export async function setSiteModeAction(formData: FormData): Promise<void> {
  const user = await assertAdmin();
  const mode: "live" | "test" = formData.get("mode") === "test" ? "test" : "live";
  const service = String(formData.get("service") ?? "both");
  const current = await getSettings();
  const touchStripe = service === "stripe" || service === "both";
  const touchBoxtal = service === "boxtal" || service === "both";
  const next = {
    ...current,
    payments: touchStripe ? { ...current.payments, mode } : current.payments,
    shipping: touchBoxtal ? { ...current.shipping, boxtalMode: mode } : current.shipping,
  };
  await saveSettings(next);
  await audit(user.email, "settings.mode", "settings/site", `${service} → ${mode}`);
  revalidatePath("/", "layout");
}
