import "server-only";
import { clearCart } from "@/lib/db/carts";
import { addAddress, updateCustomer } from "@/lib/db/customers";
import { subscribeEmail } from "@/lib/db/newsletter";
import { getOrder } from "@/lib/db/orders";
import { incrementPromoUses } from "@/lib/db/promos";
import type { Order } from "@/lib/domain/types";
import { sendOrderConfirmation } from "@/lib/email/send";
import { makeConfigured, sendOrderToMake } from "@/lib/make/tiime";
import { notifyNewOrder } from "@/lib/push/send";

/*
 * Suites communes d'une commande payée, quelle qu'en soit l'origine (webhook Stripe ou
 * commande gratuite créée sur le site) : vider le panier, mémoriser l'adresse, consommer
 * les codes promo, inscrire à la newsletter si le client l'a demandé, facturer dans Tiime
 * via Make, puis envoyer l'e-mail de confirmation (avec la facture jointe si Make l'a
 * renvoyée). Jamais bloquant : chaque étape est isolée.
 */
export async function fulfillOrder(
  order: Order,
  cartId: string | undefined,
  input: { customerUid?: string; shippingAddress: Order["shippingAddress"]; promoCodes?: string[]; newsletter?: boolean },
  by = "stripe",
): Promise<Order> {
  if (cartId) await clearCart(cartId).catch(() => undefined);
  if (input.customerUid) await addAddress(input.customerUid, input.shippingAddress).catch(() => undefined);
  if (input.promoCodes?.length) await incrementPromoUses(input.promoCodes).catch(() => undefined);
  if (input.newsletter) {
    // Case cochée à la caisse : inscription directe (preuve horodatée, source « commande »)
    // et, pour un client connecté, consentement porté sur sa fiche.
    await subscribeEmail(order.email, "commande").catch(() => undefined);
    if (input.customerUid) await updateCustomer(input.customerUid, { newsletter: { optIn: true, at: Date.now() } }).catch(() => undefined);
  }

  // Notification push à l'admin (nouvelle commande) — jamais bloquant.
  await notifyNewOrder(order).catch(() => undefined);

  let invoiced = order;
  if (makeConfigured()) {
    await sendOrderToMake(order.id, by).catch((err) => console.warn("[fulfill] envoi Make/Tiime :", err));
    invoiced = (await getOrder(order.id)) ?? order;
  }
  await sendOrderConfirmation(invoiced).catch((err) => console.warn("[fulfill] e-mail de confirmation non envoyé :", err));
  return invoiced;
}
