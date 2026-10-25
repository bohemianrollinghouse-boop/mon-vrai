import { describe, expect, it } from "vitest";
import { campaignBoard, type StepKey } from "./campaign-board";
import type { Campaign, Contract, Deliverable, Influencer, Operation, Order } from "@/lib/domain/types";

/*
 * Ce qui est vérifié ici tient en une phrase : chaque étape se déduit de ce qui existe
 * déjà, et le CAMP est dit juste — ce qui dépend de nous ne doit pas se noyer dans ce
 * qu'on attend des autres, sans quoi l'écran ne sert plus à rien.
 */

const NOW = Date.parse("2026-10-25T10:00:00Z");

const operation = (over: Partial<Operation> = {}): Operation =>
  ({
    id: "op_1",
    name: "Lancement automne",
    collaborationType: "UGC",
    startAt: NOW - 86_400_000,
    endAt: NOW + 86_400_000,
    discount: 10,
    codeMode: "partner",
    contractId: "ct_ugc",
    ...over,
  }) as Operation;

const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    id: "ct_ugc",
    name: "UGC standard",
    type: "UGC",
    version: "UGC-2026-09-v1",
    expected: { photos: 5, videos: 2 },
    publications: [{ id: "pub_reel", label: "Réel Instagram", qty: 2 }],
    active: true,
    ...over,
  }) as Contract;

const campaign = (over: Partial<Campaign> = {}): Campaign =>
  ({
    id: "cp_1",
    influencerId: "inf_1",
    operationId: "op_1",
    seq: 1,
    name: "Collab automne",
    contractId: "ct_ugc",
    expected: { photos: 0, videos: 0 },
    publications: [],
    kit: { enabled: true, title: "", text: "", lines: [], deductStock: false, prototype: false },
    kitOrderId: "",
    signatureId: "",
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Campaign;

const order = (over: Partial<Order> = {}): Order => ({ id: "ord_1", number: "MV-2026-00042", status: "shipped", ...over }) as Order;

const influencer = (over: Partial<Influencer> = {}): Influencer => ({ id: "inf_1", name: "Camille", ...over }) as Influencer;

const file = (kind: "photo" | "video", campaignId = "cp_1", id = Math.random().toString(36)): Deliverable =>
  ({ id, campaignId, influencerId: "inf_1", kind }) as Deliverable;

const call = (over: Partial<Parameters<typeof campaignBoard>[0]> = {}) =>
  campaignBoard({
    operations: [operation()],
    campaigns: [campaign()],
    influencers: [influencer()],
    contracts: [contract()],
    orders: [],
    deliverables: [],
    now: NOW,
    ...over,
  });

const stepOf = (row: { steps: { key: StepKey; state: string; detail: string }[] }, key: StepKey) => row.steps.find((s) => s.key === key)!;

describe("suivi des campagnes", () => {
  it("écarte l'annulée, garde la close", () => {
    const { groups, totals } = call({
      campaigns: [
        campaign({ id: "a", status: "active" }),
        campaign({ id: "b", status: "draft" }),
        campaign({ id: "c", status: "completed", completedAt: NOW }),
        campaign({ id: "d", status: "cancelled" }),
      ],
    });
    expect(totals.running).toBe(2);
    expect(totals.closed).toBe(1);
    /* L'annulée ne doit rien à personne ; la close, elle, prouve que la clôture a eu lieu. */
    expect(groups[0].rows.map((r) => r.campaign.id)).not.toContain("d");
    expect(groups[0].rows.map((r) => r.campaign.id)).toContain("c");
  });

  it("descend la close en bas, sans la faire attendre quoi que ce soit", () => {
    const { groups } = call({
      campaigns: [
        campaign({ id: "close", status: "completed", completedAt: NOW, kitOrderId: "ord_1" }),
        campaign({ id: "vivante", status: "active" }),
      ],
      orders: [order({ status: "paid" })],
    });
    const rows = groups[0].rows;
    expect(rows.map((r) => r.campaign.id)).toEqual(["vivante", "close"]);
    /* Un colis jamais expédié sur une campagne close n'appelle plus de geste. */
    expect(rows[1].closed).toBe(true);
    expect(rows[1].ours).toBe(false);
    expect(rows[1].closable).toBe(false);
    expect(rows[1].closedOn).toBe(NOW);
  });

  it("replie une campagne dont tout est clos", () => {
    const { groups } = call({ campaigns: [campaign({ status: "completed", completedAt: NOW })] });
    expect(groups[0].allClosed).toBe(true);
    expect(call().groups[0].allClosed).toBe(false);
  });

  it("déduit chaque étape de ce qui existe, sans rien tenir à jour", () => {
    const { groups } = call({
      campaigns: [campaign({ signatureId: "sig_1", kitOrderId: "ord_1" })],
      orders: [order({ status: "delivered" })],
      deliverables: [file("photo"), file("photo"), file("photo"), file("photo"), file("photo"), file("video"), file("video")],
    });
    const row = groups[0].rows[0];
    expect(stepOf(row, "contract").state).toBe("done");
    expect(stepOf(row, "kit").state).toBe("done");
    expect(stepOf(row, "parcel").detail).toBe("reçu");
    expect(stepOf(row, "contents").state).toBe("done");
    /* Les deux réels ne sont pas parus : la campagne n'est pas close pour autant soldée. */
    expect(stepOf(row, "publications").detail).toBe("0 sur 2");
    expect(row.closable).toBe(false);
  });

  it("met dans notre camp le colis à expédier et la réception à confirmer", () => {
    const toShip = call({ campaigns: [campaign({ kitOrderId: "ord_1" })], orders: [order({ status: "paid" })] }).groups[0].rows[0];
    expect(stepOf(toShip, "parcel").state).toBe("ours");
    expect(toShip.remaining).toContain("Expédier le kit");

    const shipped = call({ campaigns: [campaign({ kitOrderId: "ord_1" })], orders: [order({ status: "shipped" })] }).groups[0].rows[0];
    expect(stepOf(shipped, "parcel").detail).toBe("à confirmer");
    expect(shipped.confirmable).toBe(true);
    expect(shipped.remaining).toContain("Confirmer la réception");
  });

  it("laisse le contrat et le kit dans leur camp", () => {
    const row = call().groups[0].rows[0];
    expect(stepOf(row, "contract").state).toBe("theirs");
    expect(stepOf(row, "kit").state).toBe("theirs");
    expect(row.ours).toBe(false);
    expect(row.remaining).toEqual(expect.arrayContaining(["Contrat à signer", "Kit à commander"]));
  });

  it("réclame les liens quand tout est paru sans qu'on les ait", () => {
    const row = call({
      campaigns: [
        campaign({
          publications: [
            { key: "pub_reel#0", done: true, where: "", url: "" },
            { key: "pub_reel#1", done: true, where: "", url: "https://www.tiktok.com/@x/1" },
          ],
        }),
      ],
    }).groups[0].rows[0];
    expect(stepOf(row, "publications").state).toBe("ours");
    expect(row.remaining).toContain("1 lien à récupérer");
  });

  it("nous renvoie à la quantité jamais écrite, plutôt qu'au partenaire", () => {
    const row = call({ contracts: [contract({ expected: { photos: 0, videos: 0 } })] }).groups[0].rows[0];
    expect(stepOf(row, "contents").state).toBe("ours");
    expect(row.remaining).toContain("Quantité à écrire au contrat");
  });

  it("ne compte rien d'attendu sans contrat ni quantité", () => {
    const row = call({ campaigns: [campaign({ contractId: "" })] }).groups[0].rows[0];
    expect(stepOf(row, "contents").state).toBe("none");
    expect(stepOf(row, "contract").state).toBe("none");
    expect(row.ours).toBe(false);
  });

  it("ne propose de clore que ce qui ne doit plus rien", () => {
    const done = call({
      campaigns: [
        campaign({
          signatureId: "sig_1",
          kitOrderId: "ord_1",
          publications: [
            { key: "pub_reel#0", done: true, where: "", url: "https://a.test/1" },
            { key: "pub_reel#1", done: true, where: "", url: "https://a.test/2" },
          ],
        }),
      ],
      orders: [order({ status: "delivered" })],
      deliverables: [...Array.from({ length: 5 }, () => file("photo")), file("video"), file("video")],
    });
    expect(done.groups[0].rows[0].closable).toBe(true);
    expect(done.totals.closable).toBe(1);
    /* Une participation encore ouverte n'est jamais close d'ici : elle n'a rien produit. */
    expect(call({ campaigns: [campaign({ status: "draft" })] }).groups[0].rows[0].closable).toBe(false);
  });

  it("fait remonter ce qui dépend de nous", () => {
    const { groups } = call({
      campaigns: [
        campaign({ id: "theirs", influencerId: "inf_2" }),
        campaign({ id: "ours", kitOrderId: "ord_1" }),
      ],
      influencers: [influencer(), influencer({ id: "inf_2", name: "Zoé" })],
      orders: [order({ status: "shipped" })],
    });
    expect(groups[0].rows.map((r) => r.campaign.id)).toEqual(["ours", "theirs"]);
  });

  it("range à part ce qui ne relève d'aucune campagne, et le met à la fin", () => {
    const { groups, totals } = call({
      campaigns: [campaign({ id: "seule", operationId: "" }), campaign({ id: "op", operationId: "op_1" })],
    });
    expect(groups).toHaveLength(2);
    expect(groups[0].operation?.id).toBe("op_1");
    expect(groups[1].operation).toBeNull();
    expect(totals.operations).toBe(1);
  });

  it("rattache à part une participation dont la campagne a été supprimée", () => {
    const { groups } = call({ operations: [], campaigns: [campaign({ operationId: "op_disparue" })] });
    expect(groups[0].operation).toBeNull();
    expect(groups[0].state).toBeNull();
  });

  it("ouvre par les campagnes qui courent, et finit par celles dont la date est passée", () => {
    const { groups } = call({
      operations: [operation(), operation({ id: "op_fini", name: "Été", startAt: NOW - 10 * 86_400_000, endAt: NOW - 86_400_000 })],
      campaigns: [campaign({ id: "a", operationId: "op_fini" }), campaign({ id: "b", operationId: "op_1" })],
    });
    expect(groups.map((g) => g.operation?.id)).toEqual(["op_1", "op_fini"]);
    expect(groups[0].state).toBe("live");
    expect(groups[1].state).toBe("over");
  });

  it("nomme le partenaire retiré sans perdre sa ligne", () => {
    const { groups } = call({ influencers: [] });
    expect(groups[0].rows[0].influencerName).toBe("Partenaire retiré");
  });
});
