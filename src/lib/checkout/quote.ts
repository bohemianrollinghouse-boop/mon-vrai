import "server-only";
import { loadCart, type CartView } from "@/lib/cart/read";
import { getSettings } from "@/lib/db/settings";
import { cartCodes } from "@/lib/db/carts";
import { getProductsBySlugs } from "@/lib/db/products";
import type { PaymentMode } from "@/lib/stripe/client";
import type { ShippingRate, SiteSettings } from "@/lib/domain/types";
import type { Applied } from "@/lib/promos/engine";
import { resolvePromos } from "@/lib/promos/resolve";

/*
 * Le devis du paiement : ce que le client va payer, calculé côté serveur à partir du
 * panier et des réglages — jamais à partir de ce que le navigateur envoie. La page de
 * paiement l'affiche ; l'action qui crée le PaymentIntent le recalcule à l'identique.
 */

export type ShippingOption = { id: string; name: string; description: string; price: number; relay: boolean; networks: string[]; offerCode: string };
export type Discount = { code: string; amount: number; label: string; viaLink: boolean; type: Applied["type"] };

export type QuoteLine = { slug: string; title: string; qty: number; unitPrice: number; total: number; image?: string; tint: "green" | "blue" | "pink" | "sand"; preorder: boolean; gift: boolean };

export type Quote = {
  cartId: string | null;
  lines: QuoteLine[];
  count: number;
  subtotal: number;
  shippingOptions: ShippingOption[];
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
    }
  }

  const freeReached = view.shipping.enabled && view.shipping.reached;
  const quote: Quote = {
    cartId: view.id,
    lines,
    count: view.count,
    subtotal: view.subtotal,
    shippingOptions: shippingOptions(settings.shipping.rates, freeReached, outcome.freeShipping),
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

export function shippingOptions(rates: ShippingRate[], freeReached: boolean, freeAll = false): ShippingOption[] {
  const enabled = rates.filter((r) => r.enabled);
  const list: ShippingRate[] = enabled.length ? enabled : [{ id: "standard", name: "Livraison", description: "", price: 490, freeAboveThreshold: true, enabled: true, boxtalOfferCode: "", relay: false, networks: [] }];
  return list.map((r) => ({ id: r.id, name: r.name, description: r.description, price: freeAll || (freeReached && r.freeAboveThreshold) ? 0 : r.price, relay: r.relay, networks: r.networks, offerCode: r.boxtalOfferCode }));
}

export function quoteTotal(quote: Pick<Quote, "subtotal" | "discount" | "shippingOptions">, rateId: string): { shipping: ShippingOption; total: number } {
  const shipping = quote.shippingOptions.find((o) => o.id === rateId) ?? quote.shippingOptions[0];
  const total = Math.max(0, quote.subtotal - quote.discount) + shipping.price;
  return { shipping, total };
}
