import "server-only";
import { loadCart, type CartView } from "@/lib/cart/read";
import { getSettings } from "@/lib/db/settings";
import { getStripe, type PaymentMode } from "@/lib/stripe/client";
import type { ShippingRate, SiteSettings } from "@/lib/domain/types";

/*
 * Le devis du paiement : ce que le client va payer, calculé côté serveur à partir du
 * panier et des réglages — jamais à partir de ce que le navigateur envoie. La page de
 * paiement l'affiche ; l'action qui crée le PaymentIntent le recalcule à l'identique.
 */

export type ShippingOption = { id: string; name: string; description: string; price: number; relay: boolean; networks: string[]; offerCode: string };
export type Discount = { code: string; amount: number; label: string };

export type Quote = {
  cartId: string | null;
  lines: { slug: string; title: string; qty: number; unitPrice: number; total: number; image?: string; tint: "green" | "blue" | "pink" | "sand"; preorder: boolean }[];
  count: number;
  subtotal: number;
  shippingOptions: ShippingOption[];
  discount: Discount | null;
  promoError: string | null;
  countries: string[];
  freeThreshold: number;
  freeReached: boolean;
};

export async function buildQuote(mode: PaymentMode): Promise<{ quote: Quote; view: CartView; settings: SiteSettings }> {
  const [view, settings] = await Promise.all([loadCart(), getSettings()]);
  const freeReached = view.shipping.enabled && view.shipping.reached;
  const promo = view.cart.promoCode ? await resolvePromo(mode, view.cart.promoCode, view.subtotal) : { discount: null, error: null };

  const quote: Quote = {
    cartId: view.id,
    lines: view.lines.map((l) => ({
      slug: l.product.slug,
      title: l.product.title,
      qty: l.qty,
      unitPrice: l.product.price,
      total: l.qty * l.product.price,
      image: l.product.images[0]?.url,
      tint: l.product.tint,
      preorder: l.product.preorder.enabled,
    })),
    count: view.count,
    subtotal: view.subtotal,
    shippingOptions: shippingOptions(settings.shipping.rates, freeReached),
    discount: promo.discount,
    promoError: promo.error,
    countries: settings.shipping.countries,
    freeThreshold: settings.shipping.freeThreshold,
    freeReached,
  };
  return { quote, view, settings };
}

export function shippingOptions(rates: ShippingRate[], freeReached: boolean): ShippingOption[] {
  const enabled = rates.filter((r) => r.enabled);
  const list: ShippingRate[] = enabled.length ? enabled : [{ id: "standard", name: "Livraison", description: "", price: 490, freeAboveThreshold: true, enabled: true, boxtalOfferCode: "", relay: false, networks: [] }];
  return list.map((r) => ({ id: r.id, name: r.name, description: r.description, price: freeReached && r.freeAboveThreshold ? 0 : r.price, relay: r.relay, networks: r.networks, offerCode: r.boxtalOfferCode }));
}

export function quoteTotal(quote: Pick<Quote, "subtotal" | "discount" | "shippingOptions">, rateId: string): { shipping: ShippingOption; total: number } {
  const shipping = quote.shippingOptions.find((o) => o.id === rateId) ?? quote.shippingOptions[0];
  const total = Math.max(0, quote.subtotal - (quote.discount?.amount ?? 0)) + shipping.price;
  return { shipping, total };
}

/**
 * Un code promo est un « promotion code » Stripe (Tableau de bord → Produits → Coupons).
 * On lit le coupon associé et on calcule la remise ici, pour l'afficher avant paiement.
 */
export async function resolvePromo(mode: PaymentMode, code: string, subtotal: number): Promise<{ discount: Discount | null; error: string | null }> {
  const stripe = getStripe(mode);
  if (!stripe) return { discount: null, error: null };
  try {
    const found = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const promo = found.data[0];
    if (!promo) return { discount: null, error: `Le code « ${code} » n'existe pas ou n'est plus valable.` };
    const ref = promo.promotion?.type === "coupon" ? promo.promotion.coupon : null;
    const coupon = typeof ref === "string" ? await stripe.coupons.retrieve(ref) : ref;
    if (!coupon?.valid) return { discount: null, error: `Le code « ${code} » a expiré.` };
    const minimum = promo.restrictions?.minimum_amount ?? 0;
    if (minimum && subtotal < minimum) return { discount: null, error: `Le code « ${code} » s'applique à partir de ${(minimum / 100).toFixed(2).replace(".", ",")} €.` };
    let amount = 0;
    let label = "";
    if (coupon.percent_off) {
      amount = Math.round((subtotal * coupon.percent_off) / 100);
      label = `−${coupon.percent_off} %`;
    } else if (coupon.amount_off && (coupon.currency ?? "eur") === "eur") {
      amount = Math.min(subtotal, coupon.amount_off);
      label = `−${(coupon.amount_off / 100).toFixed(2).replace(".", ",")} €`;
    }
    if (!amount) return { discount: null, error: `Le code « ${code} » ne s'applique pas à ce panier.` };
    return { discount: { code: promo.code, amount, label }, error: null };
  } catch (err) {
    console.warn("[checkout] code promo :", err);
    return { discount: null, error: "Impossible de vérifier ce code pour le moment." };
  }
}
