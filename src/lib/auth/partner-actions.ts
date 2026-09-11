"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInfluencer } from "@/lib/auth/session";
import { getInfluencerByUid, upsertInfluencer } from "@/lib/db/promos";
import { createKitOrder } from "@/lib/db/orders";
import { partnerKitSnapshot } from "@/lib/db/partner";
import { getSettings } from "@/lib/db/settings";
import { optionOfferCode, shippingOptions } from "@/lib/checkout/quote";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";
import { kitOrderLines, kitWeightG } from "@/lib/promos/kit";
import { isIban } from "@/lib/promos/statements";

/*
 * Actions que le partenaire exécute lui-même, depuis son espace. Le partenaire visé
 * n'est jamais lu dans le formulaire : il se déduit de la session. Sans quoi un
 * partenaire pourrait écrire les coordonnées bancaires d'un autre en changeant un
 * champ caché.
 */

export type PartnerResult = { ok: true; message: string } | { ok: false; error: string };

export async function savePartnerIbanAction(formData: FormData): Promise<PartnerResult> {
  const user = await requireInfluencer();
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) return { ok: false, error: "Compte partenaire introuvable." };
  if (!influencer.commission) return { ok: false, error: "Aucun versement n'est prévu pour ce compte." };

  const raw = String(formData.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();
  if (raw && !isIban(raw)) return { ok: false, error: "Cet IBAN ne semble pas valide." };

  await upsertInfluencer({ ...influencer, iban: raw });
  revalidatePath("/partenaire");
  return { ok: true, message: raw ? "Coordonnées bancaires enregistrées." : "Coordonnées bancaires retirées." };
}


const KitOrder = z.object({
  name: z.string().trim().min(1, "Indiquez le nom du destinataire").max(80),
  line1: z.string().trim().min(1, "Indiquez l'adresse"),
  line2: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().min(1, "Indiquez le code postal").max(12),
  city: z.string().trim().min(1, "Indiquez la ville").max(80),
  country: z.string().trim().length(2),
  phone: z.string().trim().max(30).optional(),
  rateId: z.string().trim().min(1, "Choisissez un mode de livraison"),
  relay: z.string().default(""),
});

const Relay = z.object({
  code: z.string().min(1),
  name: z.string().default(""),
  street: z.string().default(""),
  postalCode: z.string().default(""),
  city: z.string().default(""),
  network: z.string().default(""),
});

/** Le point relais choisi, tel que la carte Boxtal l'a remonté ; null si rien de lisible. */
function parseRelay(raw: string): z.infer<typeof Relay> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = Relay.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/*
 * Commande du kit de bienvenue par le partenaire lui-même.
 *
 * Formulaire simplifié du tunnel d'achat : pas de panier, pas de paiement, pas de code
 * promo — seulement où livrer. Tout le reste (les livres offerts, le fait qu'il n'en ait
 * pas déjà commandé un) est relu en base : le formulaire ne dit que l'adresse.
 *
 * La commande créée est une commande normale, ce qui la rend expédiable par Boxtal
 * exactement comme les autres — et son suivi remonte tout seul dans l'espace.
 */
export async function orderPartnerKitAction(formData: FormData): Promise<PartnerResult> {
  const user = await requireInfluencer();
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) return { ok: false, error: "Compte partenaire introuvable." };

  const kit = await partnerKitSnapshot(influencer);
  if (!kit.offered) return { ok: false, error: "Le kit de bienvenue n'est pas disponible pour le moment." };
  if (kit.order) return { ok: false, error: "Votre kit a déjà été commandé." };

  const parsed = KitOrder.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const d = parsed.data;

  const settings = await getSettings();
  if (!settings.shipping.countries.includes(d.country)) return { ok: false, error: "Nous ne livrons pas encore dans ce pays." };

  // Port offert : on ne lit le barème que pour retrouver l'offre Boxtal du mode choisi.
  const weight = Math.max(1, settings.shipping.parcel.baseWeightG + kitWeightG(kit.items));
  const options = shippingOptions(settings.shipping.rates, bracketIndexForWeight(weight), true, true);
  const option = options.find((o) => o.id === d.rateId);
  if (!option) return { ok: false, error: "Ce mode de livraison n'est plus proposé." };

  let relay: z.infer<typeof Relay> | undefined;
  if (option.relay) {
    relay = parseRelay(d.relay);
    if (!relay) return { ok: false, error: "Choisissez un point relais sur la carte." };
  }

  const email = influencer.email.trim().toLowerCase() || user.email;
  if (!email) return { ok: false, error: "Aucune adresse e-mail sur votre compte." };

  const order = await createKitOrder({
    influencerId: influencer.id,
    lines: kitOrderLines(kit.items),
    email,
    shippingAddress: {
      name: d.name,
      line1: d.line1,
      line2: d.line2 || undefined,
      postalCode: d.postalCode,
      city: d.city,
      country: d.country,
      phone: d.phone || undefined,
    },
    delivery: { rateId: option.id, rateName: option.name, offerCode: optionOfferCode(option, d.country), relay },
    livemode: settings.payments.mode === "live",
    note: `Kit de bienvenue · ${influencer.name}`,
  });

  // Mémorisé sur la fiche : l'admin voit d'un coup d'œil que le kit est parti.
  await upsertInfluencer({ ...influencer, kitOrderId: order.id }).catch(() => undefined);
  revalidatePath("/partenaire");
  return { ok: true, message: `Kit commandé — commande ${order.number}.` };
}
