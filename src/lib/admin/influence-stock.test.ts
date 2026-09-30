import { describe, expect, it } from "vitest";
import { Campaign, Contest, Order, Product } from "@/lib/domain/types";
import { influenceReserved, influenceRows, influenceSent, shortTitles } from "./influence-stock";

/*
 * Ce qui compte vraiment ici : ne pas décompter deux fois. Une campagne promet, une
 * commande prend — et le disponible ne doit pas bouger au passage de l'une à l'autre.
 */

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 8, 30);

const produit = (slug: string, influenceStock: number) =>
  Product.parse({ slug, title: slug, price: 1000, influenceStock, createdAt: 1, updatedAt: 1 });

const participation = (over: Record<string, unknown>) =>
  Campaign.parse({
    id: "cmp_1",
    influencerId: "inf_1",
    kit: { enabled: true, lines: [{ slug: "les-fruits", qty: 3 }], deductStock: false },
    status: "draft",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

const concours = (over: Record<string, unknown>) =>
  Contest.parse({
    id: "cts_1",
    name: "Jeu de la rentrée",
    startAt: MAINTENANT - JOUR,
    endAt: MAINTENANT + JOUR,
    prize: { lines: [{ slug: "les-fruits", qty: 1 }], extra: "", deductStock: false },
    winnersWanted: 2,
    published: true,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

const ligne = (slug: string, qty: number) => ({ productSlug: slug, title: slug, qty, unitPrice: 0, gift: true });

const commande = (over: Record<string, unknown>) =>
  Order.parse({
    id: "ord_1",
    number: "MV-2026-00001",
    status: "shipped",
    lines: [ligne("les-fruits", 3)],
    totals: { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0, currency: "eur" },
    email: "lea@exemple.fr",
    shippingAddress: { name: "Léa", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR" },
    kit: { influencerId: "inf_1", stock: false, seq: 1 },
    timeline: [{ at: 1, status: "paid" }],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

const gagnantServi = { id: "w1", hostId: "", handle: "@marie", name: "", email: "", declaredBy: "admin", declaredAt: 1, orderId: "ord_1", note: "" };

describe("Ce qu'une campagne réserve", () => {
  it("retient le kit d'une participation ouverte, jusqu'à ce qu'il soit commandé", () => {
    expect(influenceReserved([participation({})], [], MAINTENANT).get("les-fruits")).toBe(3);
    /* Commandé : le stock a déjà baissé, la promesse ne doit pas retenir en plus. */
    expect(influenceReserved([participation({ kitOrderId: "ord_9", status: "active" })], [], MAINTENANT).size).toBe(0);
  });

  it("ne retient plus rien pour une participation terminée, annulée, sans kit ou prise sur la vente", () => {
    const cas = [
      participation({ status: "completed" }),
      participation({ status: "cancelled" }),
      participation({ kit: { enabled: false, lines: [{ slug: "les-fruits", qty: 3 }], deductStock: false } }),
      participation({ kit: { enabled: true, lines: [{ slug: "les-fruits", qty: 3 }], deductStock: true } }),
    ];
    expect(influenceReserved(cas, [], MAINTENANT).size).toBe(0);
  });

  it("retient un lot par gagnant qu'un concours doit encore servir", () => {
    expect(influenceReserved([], [concours({})], MAINTENANT).get("les-fruits")).toBe(2);
    expect(influenceReserved([], [concours({ winners: [gagnantServi] })], MAINTENANT).get("les-fruits")).toBe(1);
  });

  it("ignore un concours en brouillon ou terminé", () => {
    const brouillon = concours({ published: false });
    const fini = concours({ endAt: MAINTENANT - JOUR, winnersWanted: 1, winners: [gagnantServi] });
    expect(influenceReserved([], [brouillon, fini], MAINTENANT).size).toBe(0);
  });
});

describe("Ce que les kits ont emporté", () => {
  it("compte tous les colis pris sur ce stock, quel que soit leur âge", () => {
    const ancien = commande({ id: "o1", createdAt: 1, status: "delivered" });
    const recent = commande({ id: "o2", status: "paid" });
    const lot = commande({ id: "o3", kit: undefined, prize: { contestId: "cts_1", winnerId: "w1", stock: false }, lines: [ligne("les-fruits", 1)] });
    expect(influenceSent([ancien, recent, lot]).get("les-fruits")).toBe(7);
  });

  it("oublie un colis annulé ou remboursé : ses exemplaires sont revenus", () => {
    const annule = commande({ id: "o1", status: "cancelled" });
    const rembourse = commande({ id: "o2", status: "refunded" });
    /* Un kit pris sur le stock de vente n'a rien emporté ici. */
    const surVente = commande({ id: "o3", kit: { influencerId: "inf_1", stock: true, seq: 1 } });
    expect(influenceSent([annule, rembourse, surVente]).size).toBe(0);
  });
});

describe("La ligne d'un titre", () => {
  it("laisse disponible ce que les promesses n'ont pas retenu", () => {
    const rows = influenceRows([produit("les-fruits", 20)], [], [participation({})], [concours({})], MAINTENANT);
    expect(rows[0]).toMatchObject({ stock: 20, sent: 0, reserved: 5, available: 15 });
  });

  it("ne bouge pas le disponible quand un kit réservé est commandé", () => {
    const avant = influenceRows([produit("les-fruits", 20)], [], [participation({})], [], MAINTENANT)[0];
    /* Le kit part : le stock ne bouge pas, l'exemplaire passe de promis à envoyé. */
    const apres = influenceRows([produit("les-fruits", 20)], [commande({})], [participation({ kitOrderId: "ord_9", status: "active" })], [], MAINTENANT)[0];
    expect(avant).toMatchObject({ stock: 20, sent: 0, reserved: 3, available: 17 });
    expect(apres).toMatchObject({ stock: 20, sent: 3, reserved: 0, available: 17 });
  });

  it("retranche du disponible ce qui est parti, même longtemps avant cet écran", () => {
    const rows = influenceRows([produit("les-fruits", 20)], [commande({ createdAt: 1, status: "delivered" })], [], [], MAINTENANT);
    expect(rows[0]).toMatchObject({ stock: 20, sent: 3, reserved: 0, available: 17 });
  });

  it("passe en négatif quand on a promis plus qu'on n'a, et le signale", () => {
    const rows = influenceRows([produit("les-fruits", 2)], [], [participation({})], [concours({})], MAINTENANT);
    expect(rows[0].available).toBe(-3);
    expect(shortTitles(rows)).toHaveLength(1);
  });

  it("garde les titres sans stock influence : c'est là qu'on enregistre un carton", () => {
    const rows = influenceRows([produit("le-visage", 0)], [], [], [], MAINTENANT);
    expect(rows).toHaveLength(1);
    expect(shortTitles(rows)).toHaveLength(0);
  });
});
