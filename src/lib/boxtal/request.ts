import type { Order, SiteSettings } from "@/lib/domain/types";
import type { BoxtalAddress, CreateShippingOrderRequest } from "./client-types";
import { findOffer } from "./offers";

/*
 * Construction de la demande d'expédition Boxtal à partir d'une commande et des
 * réglages. Fonctions pures, sans accès réseau ni base : testables à sec.
 */

/*
 * Poids du colis en kg : emballage + somme des poids des articles. Le poids d'un article
 * est celui figé à la commande (par produit) ; à défaut (anciennes commandes), on retombe
 * sur le poids par défaut des réglages.
 */
export function parcelWeightKg(order: Order, settings: SiteSettings): number {
  const fallback = settings.shipping.parcel.unitWeightG;
  const items = order.lines.reduce((s, l) => s + l.qty * (l.weightG ?? fallback), 0);
  return Math.max(0.05, (settings.shipping.parcel.baseWeightG + items) / 1000);
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || "Client", lastName: parts[0] || "Client" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function senderAddress(settings: SiteSettings): BoxtalAddress {
  const s = settings.shipping.sender;
  const fallbackLines = settings.legal.sellerAddressLines;
  const street = s.street || fallbackLines[0] || "";
  const cityLine = fallbackLines[1] ?? "";
  const m = cityLine.match(/^(\d{4,5})\s+(.+)$/);
  const missing: string[] = [];
  const addr: BoxtalAddress = {
    type: "BUSINESS",
    contact: {
      firstName: s.firstName || "Mon",
      lastName: s.lastName || "Vrai",
      company: s.company || settings.legal.sellerName || settings.shopName,
      email: s.email || settings.contact.email || "",
      phone: s.phone || settings.contact.phone || "",
    },
    location: { street, postalCode: s.postalCode || m?.[1] || "", city: s.city || m?.[2] || "", countryIsoCode: s.country || "FR" },
  };
  if (!addr.location.street) missing.push("rue");
  if (!addr.location.postalCode) missing.push("code postal");
  if (!addr.location.city) missing.push("ville");
  if (!addr.contact.email) missing.push("e-mail");
  if (!addr.contact.phone) missing.push("téléphone");
  if (missing.length) throw new Error(`Adresse d'expédition incomplète dans Paramètres → Boxtal : ${missing.join(", ")}.`);
  return addr;
}

export function buildShippingOrderRequest(order: Order, settings: SiteSettings): CreateShippingOrderRequest {
  const rate = settings.shipping.rates.find((r) => r.id === order.delivery?.rateId);
  const offerCode = order.delivery?.offerCode || rate?.boxtalOfferCode || "";
  if (!offerCode) throw new Error("Aucune offre Boxtal associée au mode de livraison de cette commande (Paramètres → Livraison).");
  const offer = findOffer(offerCode);
  if ((offer?.relay || rate?.relay) && !order.delivery?.relay?.code) throw new Error("Livraison en point relais sans point choisi : impossible de créer l'étiquette.");

  const a = order.shippingAddress;
  const name = splitName(a.name);
  const to: BoxtalAddress = {
    type: "RESIDENTIAL",
    contact: { firstName: name.firstName, lastName: name.lastName, email: order.email, phone: a.phone || "" },
    location: { street: [a.line1, a.line2].filter(Boolean).join(", "), postalCode: a.postalCode, city: a.city, countryIsoCode: a.country },
  };
  if (!to.contact.phone) throw new Error("Le transporteur exige un numéro de téléphone du destinataire ; ajoutez-le dans la commande.");

  const p = settings.shipping.parcel;
  const value = Math.max(1, Math.round(order.totals.subtotal - order.totals.discount) / 100);
  return {
    shippingOfferCode: offerCode,
    labelType: p.labelType,
    insured: false,
    shipment: {
      externalId: order.number,
      fromAddress: senderAddress(settings),
      toAddress: to,
      pickupPointCode: order.delivery?.relay?.code || undefined,
      packages: [
        {
          externalId: `${order.number}-1`,
          type: "PARCEL",
          length: p.lengthCm,
          width: p.widthCm,
          height: p.heightCm,
          weight: Math.round(parcelWeightKg(order, settings) * 1000) / 1000,
          value: { value, currency: "EUR" },
          content: { id: p.contentCategoryId, description: order.lines.map((l) => `${l.qty}× ${l.title}`).join(", ").slice(0, 200) },
        },
      ],
    },
  };
}

