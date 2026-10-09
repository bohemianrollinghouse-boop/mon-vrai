import { describe, expect, it } from "vitest";
import { contentDues } from "./content-dues";
import type { Campaign, Contract, Deliverable, Influencer } from "@/lib/domain/types";

/*
 * Ce qui est vérifié ici tient en une phrase : le nombre vient du contrat, les fichiers
 * viennent des campagnes, et la soustraction doit survivre aux cas tordus — un contrat
 * retiré, une campagne annulée, un partenaire trop généreux.
 */

const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    id: "ct_ugc",
    name: "UGC standard",
    type: "UGC",
    version: "UGC-2026-09-v1",
    summary: "",
    body: "Article 1",
    variables: {},
    requiredVariables: [],
    expected: { photos: 40, videos: 20 },
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Contract;

const campaign = (over: Partial<Campaign> = {}): Campaign =>
  ({
    id: "cp_1",
    influencerId: "inf_1",
    seq: 1,
    name: "Collab printemps",
    contractId: "ct_ugc",
    contractVariables: {},
    expected: { photos: 0, videos: 0 },
    kitOrderId: "",
    signatureId: "",
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Campaign;

const influencer = (over: Partial<Influencer> = {}): Influencer => ({ id: "inf_1", name: "Camille", ...over }) as Influencer;

const file = (kind: "photo" | "video", campaignId = "cp_1", id = Math.random().toString(36)): Deliverable =>
  ({ id, campaignId, influencerId: "inf_1", kind }) as Deliverable;

const call = (over: Partial<Parameters<typeof contentDues>[0]> = {}) =>
  contentDues({ campaigns: [campaign()], contracts: [contract()], influencers: [influencer()], deliverables: [], ...over });

describe("contentDues", () => {
  it("prend la quantité du contrat quand la campagne n'en dit rien", () => {
    const { rows } = call();
    expect(rows[0].expected).toEqual({ photos: 40, videos: 20 });
    expect(rows[0].contractName).toBe("UGC standard");
  });

  it("retranche les fichiers reçus, par type", () => {
    const { rows } = call({ deliverables: [file("photo"), file("photo"), file("video")] });
    expect(rows[0].received).toEqual({ photos: 2, videos: 1 });
    expect(rows[0].missing.photos).toBe(38);
    expect(rows[0].missing.videos).toBe(19);
  });

  it("laisse la campagne déroger au contrat, sans jamais additionner les deux", () => {
    const { rows } = call({ campaigns: [campaign({ expected: { photos: 10, videos: 0 } })] });
    expect(rows[0].expected).toEqual({ photos: 10, videos: 0 });
  });

  it("ignore une campagne annulée : la contrepartie n'a jamais été remise", () => {
    expect(call({ campaigns: [campaign({ status: "cancelled" })] }).rows).toHaveLength(0);
  });

  it("montre une campagne sous contrat sans quantité, pour qu'on aille l'écrire", () => {
    const { rows, totals } = call({ contracts: [contract({ expected: { photos: 0, videos: 0 } })] });
    expect(rows[0].missing.agreed).toBe(false);
    expect(totals.toFill).toBe(1);
    expect(totals.late).toBe(0);
  });

  it("écarte une campagne qui ne réclame rien et n'a pas de contrat", () => {
    expect(call({ campaigns: [campaign({ contractId: "" })], contracts: [] }).rows).toHaveLength(0);
  });

  it("dit « contrat retiré » plutôt que de perdre la campagne", () => {
    const { rows } = call({ contracts: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].contractName).toBe("");
    expect(rows[0].expected).toEqual({ photos: 0, videos: 0 });
  });

  it("ne laisse pas un partenaire généreux combler le retard d'un autre", () => {
    const { totals } = call({
      campaigns: [campaign(), campaign({ id: "cp_2", influencerId: "inf_2", seq: 2 })],
      influencers: [influencer(), influencer({ id: "inf_2", name: "Alix" })],
      /* 50 photos sur une campagne qui en attend 40 : les 10 de trop ne comptent pas. */
      deliverables: Array.from({ length: 50 }, (_, i) => file("photo", "cp_1", `d${i}`)),
    });
    expect(totals.expectedPhotos).toBe(80);
    expect(totals.receivedPhotos).toBe(40);
    expect(totals.missingPhotos).toBe(40);
  });

  it("met en tête ce qui manque le plus, et en queue ce qui est complet", () => {
    const complete = campaign({ id: "cp_ok", seq: 3, expected: { photos: 1, videos: 0 } });
    const toFill = campaign({ id: "cp_vide", seq: 2, contractId: "ct_vide" });
    const { rows } = call({
      campaigns: [complete, toFill, campaign()],
      contracts: [contract(), contract({ id: "ct_vide", version: "v2", expected: { photos: 0, videos: 0 } })],
      deliverables: [file("photo", "cp_ok", "d_ok")],
    });
    expect(rows.map((r) => r.campaign.id)).toEqual(["cp_1", "cp_vide", "cp_ok"]);
  });
});
