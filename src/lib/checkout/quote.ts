import "server-only";
import { loadCart, type CartView } from "@/lib/cart/read";
import { getSettings } from "@/lib/db/settings";
import { cartCodes } from "@/lib/db/carts";
import { getProductsBySlugs } from "@/lib/db/products";
import type { PaymentMode } from "@/lib/stripe/client";
import type { ShippingRate, SiteSettings } from "@/lib/domain/types";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";
import type { Applied } from "@/lib/promos/engine";
import { resolvePromos } from "@/lib/promos/resolve";

/*
 * Le devis du paiement : ce que le client va payer, calculé côté serveur à partir du
 * panier et des réglages — jamais à partir de ce que le navigateur envoie. La page de
 * paiement l'affiche ; l'action qui crée le PaymentIntent le recalcule à l'identique.
 *
 * Le prix de livraison dépend du poids du colis (calculé ici depuis les poids produits)
 * ET du pays de destination (FR, BE, LU), choisi par le client. Le devis fournit donc,
 * pour chaque mode, un prix et une offre Boxtal par pays ; la page en retient le pays
 * sélectionné.
 */

export type ByCountry<T> = { FR: T; BE: T; LU: T };
export type ShippingOption = {
  id: string;
  name: string;
  description: string;
  relay: boolean;
  networks: string[];
  /** Prix TTC par pays, déjà ajusté (0 si livraison offerte). */
  pricesByCountry: ByCountry<number>;
  /** Offre Boxtal par pays (Chrono 13 en FR, Chrono Classic en BE/LU…). */
  offerCodesByCountry: ByCountry<string>;
};
export type Discount = { code: string; amount: number; label: string; viaLink: boolean; type: Applied["type"] };

export type QuoteLine = { slug: string; title: string; qty: number; unitPrice: number; total: number; image?: string; tint: "green" | "blue" | "pink" | "sand"; preorder: boolean; gift: boolean };

export type Quote = {
  cartId: string | null;
  lines: QuoteLine[];
  count: number;
  subtotal: number;
  shippingOptions: ShippingOption[];
  /** Poids du colis estimé, en grammes (emballage + articles). */
  parcelWeightG: number;
  /** Codes appliqués (remises, port offert, produits offerts). */
  applied: Discount[];
  rejected: { code: string; reason: string }[];
  discount: number;
  freeShipping: boolean;
  attribution: { influencerId: string; via: "code" | "link" } | null;
  codes: string[];
  countries: string[];
  freeThreshold: number;
  freeReached: boolean;
};

export async function buildQuote(_mode: PaymentMode, email?: string): Promise<{ quote: Quote; view: CartView; settings: SiteSettings }> {
  const [view, settings] = await Promise.all([loadCart(), getSettings()]);
  const codes = cartCodes(view.cart);
  const outcome = await resolvePromos({
    codes,
    items: view.lines.map((l) => ({ slug: l.product.slug, qty: l.qty, unitPrice: l.product.price, title: l.product.title, stock: l.product.stock })),
    subtotal: view.subtotal,
    email,
  });

  const parcel = settings.shipping.parcel;
  let itemsWeight = view.lines.reduce((s, l) => s + l.qty * (l.product.weightG ?? parcel.unitWeightG), 0);

  const lines: QuoteLine[] = view.lines.map((l) => ({
    slug: l.product.slug,
    title: l.product.title,
    qty: l.qty,
    unitPrice: l.product.price,
    total: l.qty * l.product.price,
    image: l.product.images[0]?.url,
    tint: l.product.tint,
    preorder: l.product.preorder.enabled,
    gift: false,
  }));
  // Produits offerts : une ligne à 0 €, si le produit est publié et en stock.
  if (outcome.giftLines.length) {
    const gifts = await getProductsBySlugs(outcome.giftLines.map((g) => g.slug));
    for (const g of outcome.giftLines) {
      const p = gifts.get(g.slug);
      if (!p || p.status !== "published" || (p.stock !== null && p.stock <= 0)) continue;
      lines.push({ slug: p.slug, title: p.title, qty: g.qty, unitPrice: 0, total: 0, image: p.images[0]?.url, tint: p.tint, preorder: p.preorder.enabled, gift: true });
      itemsWeight += g.qty * (p.weightG ?? parcel.unitWeightG);
    }
  }

  const parcelWeightG = Math.max(1, parcel.baseWeightG + itemsWeight);
  const bracket = bracketIndexForWeight(parcelWeightG);

  const freeReached = view.shipping.enabled && view.shipping.reached;
  const quote: Quote = {
    cartId: view.id,
    lines,
    count: view.count,
    subtotal: view.subtotal,
    shippingOptions: shippingOptions(settings.shipping.rates, bracket, freeReached, outcome.freeShipping),
    parcelWeightG,
    applied: outcome.applied.map((a) => ({ code: a.code, amount: a.amount, label: a.label, viaLink: a.viaLink, type: a.type })),
    rejected: outcome.rejected,
    discount: outcome.discount,
    freeShipping: outcome.freeShipping,
    attribution: outcome.attribution,
    codes,
    countries: settings.shipping.countries,
    freeThreshold: settings.shipping.freeThreshold,
    freeReached,
  };
  return { quote, view, settings };
}

/** Prix d'un tarif pour une tranche donnée et un pays ; retombe sur la France, puis sur la dernière tranche connue. */
function rowPrice(row: number[] | undefined, bracket: number): number {
  if (!row || row.length === 0) return 0;
  return row[bracket] ?? row[row.length - 1] ?? 0;
}

export function shippingOptions(rates: ShippingRate[], bracket: number, freeReached: boolean, freeAll = false): ShippingOption[] {
  const enabled = rates.filter((r) => r.enabled);
  const list: ShippingRate[] = enabled.length
    ? enabled
    : [{ id: "standard", name: "Livraison", description: "", prices: { FR: [490], BE: [490], LU: [490] }, freeAboveThreshold: true, enabled: true, offerCodes: { FR: "", BE: "", LU: "" }, relay: false, networks: [] }];

  return list.map((r) => {
    const free = freeAll || (freeReached && r.freeAboveThreshold);
    const price = (c: keyof ByCountry<number>) => (free ? 0 : rowPrice(r.prices[c], bracket));
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      relay: r.relay,
      networks: r.networks,
      pricesByCountry: { FR: price("FR"), BE: price("BE"), LU: price("LU") },
      offerCodesByCountry: { FR: r.offerCodes.FR, BE: r.offerCodes.BE, LU: r.offerCodes.LU },
    };
  });
}

/** Prix d'un mode pour un pays de destination ; retombe sur la France pour un pays hors barème. */
export function optionPrice(option: ShippingOption, country: string): number {
  return option.pricesByCountry[(country as keyof ByCountry<number>)] ?? option.pricesByCountry.FR;
}

/** Offre Boxtal d'un mode pour un pays de destination. */
export function optionOfferCode(option: ShippingOption, country: string): string {
  return option.offerCodesByCountry[(country as keyof ByCountry<string>)] ?? option.offerCodesByCountry.FR;
}

export function quoteTotal(
  quote: Pick<Quote, "subtotal" | "discount" | "shippingOptions">,
  rateId: string,
  country: string,
): { shipping: ShippingOption; price: number; offerCode: string; total: number } {
  const shipping = quote.shippingOptions.find((o) => o.id === rateId) ?? quote.shippingOptions[0];
  const price = optionPrice(shipping, country);
  const total = Math.max(0, quote.subtotal - quote.discount) + price;
  return { shipping, price, offerCode: optionOfferCode(shipping, country), total };
}
