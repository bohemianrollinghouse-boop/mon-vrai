import "server-only";
import { Order } from "@/lib/domain/types";

/** Commande fictive pour l'aperçu et l'envoi de test des e-mails. */
export function sampleOrder(): Order {
  const now = Date.now();
  return Order.parse({
    id: "ord_apercu",
    number: "MV-2026-00042",
    status: "shipped",
    lines: [
      { productSlug: "les-fruits", title: "Les fruits", qty: 2, unitPrice: 1000, preorder: true, gift: false },
      { productSlug: "le-visage", title: "Le Visage", qty: 1, unitPrice: 1000, preorder: true, gift: true },
    ],
    totals: { subtotal: 3000, shipping: 0, discount: 300, tax: 0, total: 2700, currency: "eur" },
    email: "camille.dupont@exemple.fr",
    shippingAddress: { name: "Camille Dupont", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR", phone: "0612345678" },
    delivery: { rateId: "mondial-relay", rateName: "Mondial Relay — point relais", offerCode: "MONR-CpourToi", relay: { code: "22731", name: "Tabac de la Gare", street: "8 place de la Gare", postalCode: "69003", city: "Lyon", network: "MONR_NETWORK" } },
    tracking: { carrier: "Mondial Relay", number: "6A12345678901", url: "https://www.mondialrelay.fr/suivi-de-colis" },
    promoCodes: ["NOEL10"],
    stripe: { paymentIntentId: "pi_apercu" },
    timeline: [{ at: now, status: "paid" }],
    createdAt: now,
    updatedAt: now,
  });
}
