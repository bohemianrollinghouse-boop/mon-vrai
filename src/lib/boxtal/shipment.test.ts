import { describe, expect, it } from "vitest";
import { buildShippingOrderRequest, declaredValueCents, parcelWeightKg } from "./request";
import { DEFAULT_PARCEL, DEFAULT_SHIPPING_RATES, EMPTY_SENDER, Order, SiteSettings } from "@/lib/domain/types";

const settings = SiteSettings.parse({
  shopName: "Mon Vrai",
  contact: { email: "contact@monvrai.fr", addressLines: [] },
  shipping: { freeThreshold: 3000, countries: ["FR"], rates: DEFAULT_SHIPPING_RATES, parcel: DEFAULT_PARCEL, sender: { ...EMPTY_SENDER, company: "Mon Vrai", street: "78 avenue des Champs-Élysées", postalCode: "75008", city: "Paris", email: "contact@monvrai.fr", phone: "0612345678" } },
  updatedAt: 1,
});

const base = {
  id: "ord_1",
  number: "MV-2026-00042",
  status: "paid",
  lines: [
    { productSlug: "les-fruits", title: "Les fruits", qty: 2, unitPrice: 1000, preorder: false },
    { productSlug: "le-visage", title: "Le Visage", qty: 1, unitPrice: 1000, preorder: false },
  ],
  totals: { subtotal: 3000, shipping: 0, discount: 0, tax: 0, total: 3000, currency: "eur" },
  email: "camille@exemple.fr",
  shippingAddress: { name: "Camille Dupont", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR", phone: "0612345678" },
  stripe: { paymentIntentId: "pi_1" },
  timeline: [{ at: 1, status: "paid" }],
  createdAt: 1,
  updatedAt: 1,
};

describe("Boxtal - demande d'expédition", () => {
  it("calcule le poids du colis à partir des livres et de l'emballage", () => {
    expect(parcelWeightKg(Order.parse(base), settings)).toBeCloseTo(0.36, 3);
  });

  it("construit une commande Boxtal à domicile", () => {
    const order = Order.parse({ ...base, delivery: { rateId: "colissimo", rateName: "Colissimo - domicile", offerCode: "POFR-ColissimoAccess" } });
    const req = buildShippingOrderRequest(order, settings);
    expect(req.shippingOfferCode).toBe("POFR-ColissimoAccess");
    expect(req.shipment.pickupPointCode).toBeUndefined();
    expect(req.shipment.toAddress.contact).toMatchObject({ firstName: "Camille", lastName: "Dupont", phone: "0612345678" });
    expect(req.shipment.fromAddress.location.postalCode).toBe("75008");
    expect(req.shipment.packages[0]).toMatchObject({ type: "PARCEL", weight: 0.36, value: { value: 30, currency: "EUR" }, content: { id: "content:v1:10150" } });
  });

  it("exige un point relais pour une offre relais, et le transmet", () => {
    const relayOrder = { ...base, delivery: { rateId: "mondial-relay", rateName: "Mondial Relay", offerCode: "MONR-CpourToi" } };
    expect(() => buildShippingOrderRequest(Order.parse(relayOrder), settings)).toThrow(/point relais/);
    const withRelay = Order.parse({ ...relayOrder, delivery: { ...relayOrder.delivery, relay: { code: "22731", name: "LOCKER DELIPOP", street: "34 RUE DE LABORDE", postalCode: "75008", city: "PARIS", network: "MONR_NETWORK" } } });
    expect(buildShippingOrderRequest(withRelay, settings).shipment.pickupPointCode).toBe("22731");
  });

  /*
   * La valeur déclarée sert d'indemnité en cas de perte : c'est celle des livres, pas
   * la somme encaissée. Une remise, un livre offert ou un kit partenaire ne la réduisent
   * donc pas à zéro.
   */
  it("déclare la valeur des livres, sans retrancher la remise", () => {
    const remisé = Order.parse({ ...base, totals: { ...base.totals, discount: 1000, total: 2000 }, delivery: { rateId: "colissimo", rateName: "Colissimo", offerCode: "POFR-ColissimoAccess" } });
    expect(buildShippingOrderRequest(remisé, settings).shipment.packages[0].value).toEqual({ value: 30, currency: "EUR" });
  });

  it("valorise un article offert au prix courant du catalogue", () => {
    const offert = Order.parse({
      ...base,
      lines: [{ productSlug: "les-fruits", title: "Les fruits", qty: 2, unitPrice: 0, gift: true }],
      totals: { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0, currency: "eur" },
    });
    expect(declaredValueCents(offert, new Map([["les-fruits", 1400]]))).toBe(2800);
    // Sans catalogue sous la main, le plancher de Boxtal : 1 €.
    expect(declaredValueCents(offert)).toBe(100);
  });

  it("refuse une adresse d'expédition incomplète", () => {
    const bare = SiteSettings.parse({ ...settings, shipping: { ...settings.shipping, sender: EMPTY_SENDER }, legal: { ...settings.legal, sellerAddressLines: [] } });
    const order = Order.parse({ ...base, delivery: { rateId: "colissimo", rateName: "Colissimo", offerCode: "POFR-ColissimoAccess" } });
    expect(() => buildShippingOrderRequest(order, bare)).toThrow(/incomplète/);
  });
});
