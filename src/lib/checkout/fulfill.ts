import "server-only";
import { clearCart } from "@/lib/db/carts";
import { addAddress } from "@/lib/db/customers";
import { getOrder } from "@/lib/db/orders";
import { incrementPromoUses } from "@/lib/db/promos";
import type { Order } from "@/lib/domain/types";
import { sendOrderConfirmation } from "@/lib/email/send";
import { makeConfigured, sendOrderToMake } from "@/lib/make/tiime";

/*
 * Suites communes d'une commande payée, quelle qu'en soit l'origine (webhook Stripe ou
 * commande gratuite créée sur le site) : vider le panier, mémoriser l'adresse, consommer
 * les codes promo, facturer dans Tiime via Make, puis envoyer l'e-mail de confirmation
 * (avec la facture jointe si Make l'a renvoyée). Jamais bloquant : chaque étape est isolée.
 */
export async function fulfillOrder(
  order: Order,
  cartId: string | undefined,
  input: { customerUid?: string; shippingAddress: Order["shippingAddress"]; promoCodes?: string[] },
  by = "stripe",
): Promise<Order> {
  if (cartId) await clearCart(cartId).catch(() => undefined);
  if (input.customerUid) await addAddress(input.customerUid, input.shippingAddress).catch(() => undefined);
  if (input.promoCodes?.length) await incrementPromoUses(input.promoCodes).catch(() => undefined);

  let invoiced = order;
  if (makeConfigured()) {
    await sendOrderToMake(order.id, by).catch((err) => console.warn("[fulfill] envoi Make/Tiime :", err));
    invoiced = (await getOrder(order.id)) ?? order;
  }
  await sendOrderConfirmation(invoiced).catch((err) => console.warn("[fulfill] e-mail de confirmation non envoyé :", err));
  return invoiced;
}
