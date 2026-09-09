import { describe, expect, it } from "vitest";
import { buildTiimePayload } from "./payload";
import { Customer, Order } from "@/lib/domain/types";

const order = Order.parse({
  id: "ord_1",
  number: "MV-2026-00002",
  status: "paid",
  lines: [{ productSlug: "le-visage", title: "Le Visage", qty: 2, unitPrice: 1000, preorder: true }],
  totals: { subtotal: 2000, shipping: 390, discount: 0, tax: 0, total: 2390, currency: "eur" },
  customerUid: "uid-1",
  email: "camille@exemple.fr",
  shippingAddress: { name: "Camille Dupont", line1: "12 rue des Lilas", line2: "Bât. B", postalCode: "69003", city: "Lyon", country: "FR", phone: "0612345678" },
  delivery: { rateId: "mondial-relay", rateName: "Mondial Relay - point relais" },
  stripe: { paymentIntentId: "pi_1" },
  timeline: [{ at: 1, status: "paid" }],
  createdAt: 1,
  updatedAt: 1,
});

describe("Make / Tiime - corps de la requête", () => {
  it("respecte le format attendu, en euros, livraison en ligne, sans tiime_client_id inconnu", () => {
    const p = buildTiimePayload(order, Customer.parse({ uid: "uid-1", email: "camille@exemple.fr", createdAt: 1 }));
    expect(p.order_id).toBe("ord_1");
    expect(p.customer).toEqual({ firestore_id: "uid-1", email: "camille@exemple.fr", name: "Camille Dupont", address: "12 rue des Lilas, Bât. B", zip: "69003", city: "Lyon", country: "FR", phone: "0612345678" });
    expect("tiime_client_id" in p.customer).toBe(false);
    expect(p.lines).toEqual([
      { description: "Le Visage", quantity: 2, unit_price: 10 },
      { description: "Livraison - Mondial Relay - point relais", quantity: 1, unit_price: 3.9 },
    ]);
    expect(p.total).toBe(23.9);
    expect(p.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)).toBeCloseTo(p.total, 2);
    expect(p.test).toBeUndefined();
  });

  it("inclut tiime_client_id quand le client en a un, et marque les commandes de test", () => {
    const p = buildTiimePayload(Order.parse({ ...order, livemode: false }), Customer.parse({ uid: "uid-1", email: "camille@exemple.fr", tiimeClientId: 4242, createdAt: 1 }));
    expect(p.customer.tiime_client_id).toBe(4242);
    expect(p.test).toBe(true);
  });

  it("identifie un acheteur sans compte par sa commande", () => {
    const p = buildTiimePayload(Order.parse({ ...order, customerUid: undefined }), null);
    expect(p.customer.firestore_id).toBe("guest-ord_1");
  });

  it("facture à l'adresse de facturation quand elle diffère de la livraison, en gardant le téléphone du contact", () => {
    const withBilling = Order.parse({
      ...order,
      billingAddress: { name: "SARL Dupont", line1: "5 avenue de la République", postalCode: "75011", city: "Paris", country: "FR" },
    });
    const p = buildTiimePayload(withBilling, Customer.parse({ uid: "uid-1", email: "camille@exemple.fr", createdAt: 1 }));
    expect(p.customer.name).toBe("SARL Dupont");
    expect(p.customer.address).toBe("5 avenue de la République");
    expect(p.customer.zip).toBe("75011");
    expect(p.customer.city).toBe("Paris");
    // Le téléphone n'existe pas sur la facturation : on garde celui de la livraison.
    expect(p.customer.phone).toBe("0612345678");
  });
});
