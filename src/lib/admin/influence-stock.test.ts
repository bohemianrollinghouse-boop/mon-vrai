import { describe, expect, it } from "vitest";
import { Campaign, Contest, Order, Product } from "@/lib/domain/types";
import { influenceCommitments, influenceReserved, influenceRows, shortTitles } from "./influence-stock";

/*
 * Ce qui compte vraiment ici : ne pas décompter deux fois. Une campagne promet, une
 * commande prend — et l'étagère ne doit baisser qu'une fois, au départ du colis.
 */

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 8, 26);

const produit = (slug: string, influenceStock: number) =>
  Product.parse({ slug, title: slug, price: 1000, influenceStock, createdAt: 1, updatedAt: 1 });

const ligne = (slug: string, qty: number) => ({ productSlug: slug, title: slug, qty, unitPrice: 0, gift: true });

const commande = (over: Record<string, unknown>) =>
  Order.parse({
    id: "ord_1",
    number: "MV-2026-00001",
    status: "paid",
    lines: [ligne("les-fruits", 2)],
    totals: { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0, currency: "eur" },
    email: "lea@exemple.fr",
    shippingAddress: { name: "Léa", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR" },
    timeline: [{ at: 1, status: "paid" }],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

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

describe("Ce qui est réservé sur le stock influence", () => {
  it("compte les colis offerts partis du stock influence, et eux seuls", () => {
    const kit = commande({ id: "o1", kit: { influencerId: "inf_1", stock: false, seq: 1 } });
    const lot = commande({ id: "o2", prize: { contestId: "cts_1", winnerId: "win_1", stock: false } });
    /* Un kit pris sur le stock de vente est compté là-bas : il n'a rien pris ici. */
    const surVente = commande({ id: "o3", kit: { influencerId: "inf_2", stock: true, seq: 1 } });
    const vente = commande({ id: "o4", totals: { subtotal: 1000, shipping: 0, discount: 0, tax: 0, total: 1000, currency: "eur" } });

    expect(influenceReserved([kit, lot, surVente, vente]).get("les-fruits")).toBe(4);
  });

  it("oublie un colis déjà expédié : il n'est plus dans le carton", () => {
    const parti = commande({ status: "shipped", kit: { influencerId: "inf_1", stock: false, seq: 1 } });
    expect(influenceReserved([parti]).size).toBe(0);
  });
});

describe("Ce qui est engagé sans être sorti", () => {
  it("compte le kit d'une participation ouverte, jusqu'à ce qu'il soit commandé", () => {
    expect(influenceCommitments([participation({})], [], MAINTENANT).get("les-fruits")).toBe(3);
    /* Commandé : l'étagère a déjà baissé, la promesse ne tient plus le double. */
    expect(influenceCommitments([participation({ kitOrderId: "ord_9", status: "active" })], [], MAINTENANT).size).toBe(0);
  });

  it("ne doit plus rien pour une participation terminée, annulée, sans kit ou prise sur la vente", () => {
    const cas = [
      participation({ status: "completed" }),
      participation({ status: "cancelled" }),
      participation({ kit: { enabled: false, lines: [{ slug: "les-fruits", qty: 3 }], deductStock: false } }),
      participation({ kit: { enabled: true, lines: [{ slug: "les-fruits", qty: 3 }], deductStock: true } }),
    ];
    expect(influenceCommitments(cas, [], MAINTENANT).size).toBe(0);
  });

  it("compte un lot par gagnant qu'un concours doit encore servir", () => {
    expect(influenceCommitments([], [concours({})], MAINTENANT).get("les-fruits")).toBe(2);
    const unParti = concours({
      winners: [{ id: "w1", hostId: "", handle: "@marie", name: "", email: "", declaredBy: "admin", declaredAt: 1, orderId: "ord_1", note: "" }],
    });
    expect(influenceCommitments([], [unParti], MAINTENANT).get("les-fruits")).toBe(1);
  });

  it("ignore un concours en brouillon ou terminé", () => {
    const brouillon = concours({ published: false });
    const fini = concours({
      endAt: MAINTENANT - JOUR,
      winnersWanted: 1,
      winners: [{ id: "w1", hostId: "", handle: "@marie", name: "", email: "", declaredBy: "admin", declaredAt: 1, orderId: "ord_1", note: "" }],
    });
    expect(influenceCommitments([], [brouillon, fini], MAINTENANT).size).toBe(0);
  });
});

describe("La ligne d'un titre", () => {
  it("laisse libre ce que les promesses n'ont pas pris", () => {
    const rows = influenceRows([produit("les-fruits", 10)], [], [participation({})], [concours({})], MAINTENANT);
    expect(rows[0]).toMatchObject({ available: 10, reserved: 0, committed: 5, free: 5 });
  });

  it("passe en négatif quand on a promis plus qu'on n'a, et le signale", () => {
    const rows = influenceRows([produit("les-fruits", 2)], [], [participation({})], [concours({})], MAINTENANT);
    expect(rows[0].free).toBe(-3);
    expect(shortTitles(rows)).toHaveLength(1);
  });

  it("garde les titres sans stock influence : c'est là qu'on enregistre un carton", () => {
    const rows = influenceRows([produit("le-visage", 0)], [], [], [], MAINTENANT);
    expect(rows).toHaveLength(1);
    expect(shortTitles(rows)).toHaveLength(0);
  });
});
