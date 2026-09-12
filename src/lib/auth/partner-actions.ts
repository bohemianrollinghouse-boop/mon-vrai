"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInfluencer } from "@/lib/auth/session";
import { getInfluencerByUid, upsertInfluencer } from "@/lib/db/promos";
import { createKitOrder } from "@/lib/db/orders";
import { partnerKitSnapshot, type PartnerKit } from "@/lib/db/partner";
import { getSettings } from "@/lib/db/settings";
import { optionOfferCode, shippingOptions } from "@/lib/checkout/quote";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";
import { kitOrderLines, kitWeightG } from "@/lib/promos/kit";
import { isIban } from "@/lib/promos/statements";
import { getContract, recordSignature } from "@/lib/db/contracts";
import { SignerStatus, type Address, type Influencer } from "@/lib/domain/types";
import { headers } from "next/headers";

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
  /* Prénom et nom séparés, et jamais pré-remplis : le « nom » du compte est le plus
     souvent un pseudo de réseau social, pas une identité de livraison. */
  firstName: z.string().trim().min(1, "Indiquez votre prénom").max(80),
  lastName: z.string().trim().min(1, "Indiquez votre nom").max(80),
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
  // Un contrat exigé ne se contourne pas en postant ce formulaire-ci.
  if (influencer.contractId && !influencer.signatureId) return { ok: false, error: "Le contrat doit être accepté avant de commander." };

  const kit = await partnerKitSnapshot(influencer);
  if (!kit.offered) return { ok: false, error: "Le kit de bienvenue n'est pas disponible pour le moment." };
  if (kit.order) return { ok: false, error: "Votre kit a déjà été commandé." };

  const done = await orderKit(influencer, formData, kit);
  if (!done.ok) return done;
  await upsertInfluencer({ ...influencer, kitOrderId: done.orderId }).catch(() => undefined);
  revalidatePath("/partenaire");
  return { ok: true, message: `Kit commandé — commande ${done.number}.` };
}

type OrderKitOutcome = { ok: true; orderId: string; number: string; address: Address } | { ok: false; error: string };

/*
 * Crée la commande du kit à partir du formulaire d'adresse. Partagé par les deux
 * chemins — avec contrat et sans —, pour qu'il n'y ait qu'un seul endroit où une
 * adresse est validée et une commande créée.
 */
async function orderKit(influencer: Influencer, formData: FormData, kit: PartnerKit): Promise<OrderKitOutcome> {
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

  const email = influencer.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Aucune adresse e-mail sur votre compte." };

  const address: Address = {
    name: `${d.firstName} ${d.lastName}`,
    line1: d.line1,
    line2: d.line2 || undefined,
    postalCode: d.postalCode,
    city: d.city,
    country: d.country,
    phone: d.phone || undefined,
  };

  const order = await createKitOrder({
    influencerId: influencer.id,
    lines: kitOrderLines(kit.items),
    email,
    shippingAddress: address,
    delivery: { rateId: option.id, rateName: option.name, offerCode: optionOfferCode(option, d.country), relay },
    livemode: settings.payments.mode === "live",
    deductStock: influencer.kit.deductStock,
    note: `Kit de bienvenue · ${influencer.name}`,
  });

  return { ok: true, orderId: order.id, number: order.number, address };
}


const Socials = z.object({
  igHandle: z.string().trim().max(80).default(""),
  igUrl: z.string().trim().max(300).default(""),
  ttHandle: z.string().trim().max(80).default(""),
  ttUrl: z.string().trim().max(300).default(""),
  fbHandle: z.string().trim().max(80).default(""),
  fbUrl: z.string().trim().max(300).default(""),
});

/** Une adresse de profil, ou rien : on refuse un texte qui n'est pas une URL. */
const looksLikeUrl = (v: string) => !v || /^https?:\/\/[^\s]+$/i.test(v);

/*
 * Le partenaire tient ses propres comptes à jour. L'administration peut les saisir à la
 * création, mais c'est lui qui les connaît — et ils servent au contrat d'influence.
 */
export async function savePartnerSocialsAction(formData: FormData): Promise<PartnerResult> {
  const user = await requireInfluencer();
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) return { ok: false, error: "Compte partenaire introuvable." };

  const parsed = Socials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Formulaire invalide." };
  const d = parsed.data;
  for (const url of [d.igUrl, d.ttUrl, d.fbUrl]) {
    if (!looksLikeUrl(url)) return { ok: false, error: "Une adresse de profil doit commencer par https://" };
  }

  await upsertInfluencer({
    ...influencer,
    socials: {
      instagram: { handle: d.igHandle, url: d.igUrl },
      tiktok: { handle: d.ttHandle, url: d.ttUrl },
      facebook: { handle: d.fbHandle, url: d.fbUrl },
    },
  });
  revalidatePath("/partenaire");
  return { ok: true, message: "Vos réseaux sont enregistrés." };
}

/*
 * Signature du contrat, en même temps que la commande du kit — c'est un seul geste pour
 * le partenaire : « Accepter le contrat et confirmer ma commande ».
 *
 * Tout est relu en base (le contrat, les produits, leur prix du jour) : le formulaire ne
 * dit que ce que le partenaire déclare de lui-même. Et tout est FIGÉ dans la signature,
 * de sorte qu'une refonte du contrat ou une hausse de prix ne change rien à ce qui a
 * été accepté.
 */
const SignInput = z.object({
  firstName: z.string().trim().min(1, "Indiquez votre prénom").max(80),
  lastName: z.string().trim().min(1, "Indiquez votre nom").max(80),
  taxCountry: z.string().trim().length(2).default("FR"),
  signerStatus: SignerStatus,
  companyName: z.string().trim().max(160).default(""),
  siret: z.string().trim().max(20).default(""),
  vatNumber: z.string().trim().max(20).default(""),
  signerTypedName: z.string().trim().min(1, "Saisissez votre nom pour signer").max(160),
  adult: z.string().optional(),
  readAll: z.string().optional(),
  acceptedContract: z.string().optional(),
  accurate: z.string().optional(),
  inKind: z.string().optional(),
  childNotRequired: z.string().optional(),
  childAuthorisation: z.string().optional(),
  newsletterOptIn: z.string().optional(),
});

const checked = (v: string | undefined) => v === "on" || v === "true";

export async function signAndOrderKitAction(formData: FormData): Promise<PartnerResult> {
  const user = await requireInfluencer();
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) return { ok: false, error: "Compte partenaire introuvable." };

  const kit = await partnerKitSnapshot(influencer);
  if (!kit.offered) return { ok: false, error: "Le kit de bienvenue n'est pas disponible pour le moment." };
  if (kit.order) return { ok: false, error: "Votre kit a déjà été commandé." };

  const contract = await getContract(influencer.contractId);
  if (!contract) return { ok: false, error: "Aucun contrat à signer pour ce compte." };

  const parsed = SignInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const d = parsed.data;

  const checks = {
    adult: checked(d.adult),
    readAll: checked(d.readAll),
    acceptedContract: checked(d.acceptedContract),
    accurate: checked(d.accurate),
    inKind: checked(d.inKind),
    childNotRequired: checked(d.childNotRequired),
    childAuthorisation: checked(d.childAuthorisation),
  };
  // La case « autorisation parentale » n'est requise que si un enfant identifiable apparaît :
  // elle est un engagement conditionnel, pas une attestation. Les autres sont obligatoires.
  const required: (keyof typeof checks)[] = ["adult", "readAll", "acceptedContract", "accurate", "inKind", "childNotRequired"];
  if (required.some((k) => !checks[k])) return { ok: false, error: "Toutes les attestations doivent être cochées." };

  const professional = d.signerStatus !== "individual";
  if (professional && !d.siret) return { ok: false, error: "Indiquez votre SIRET." };
  if (professional && !d.companyName) return { ok: false, error: "Indiquez votre nom commercial ou raison sociale." };
  // Le nom saisi vaut signature : il doit correspondre à l'identité déclarée juste au-dessus.
  const normalise = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  if (normalise(d.signerTypedName) !== normalise(`${d.firstName}${d.lastName}`)) {
    return { ok: false, error: "Le nom saisi pour signer doit être votre prénom suivi de votre nom." };
  }

  const order = await orderKit(influencer, formData, kit);
  if (!order.ok) return order;

  const head = await headers();
  await recordSignature({
    influencerId: influencer.id,
    contractId: contract.id,
    contractName: contract.name,
    contractType: contract.type,
    contractVersion: contract.version,
    firstName: d.firstName,
    lastName: d.lastName,
    email: influencer.email || user.email || "",
    address: order.address,
    taxCountry: d.taxCountry.toUpperCase(),
    status: d.signerStatus,
    companyName: d.companyName,
    siret: d.siret,
    vatNumber: d.vatNumber,
    socials: influencer.socials,
    products: kit.items.map((i) => ({ slug: i.slug, title: i.title, qty: i.qty, unitValue: i.unitValue })),
    totalValue: kit.items.reduce((sum, i) => sum + i.unitValue * i.qty, 0),
    checks,
    newsletterOptIn: checked(d.newsletterOptIn),
    signerTypedName: d.signerTypedName,
    summarySnapshot: contract.summary,
    bodySnapshot: contract.body,
    ip: head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    userAgent: head.get("user-agent") ?? "",
  }).then(async (signature) => {
    await upsertInfluencer({ ...influencer, kitOrderId: order.orderId, signatureId: signature.id });
  });

  revalidatePath("/partenaire");
  return { ok: true, message: `Contrat accepté et kit commandé — commande ${order.number}.` };
}
