import { describe, expect, it } from "vitest";
import { pendingRenewals, renewalState } from "./renewal";
import type { Campaign, Influencer } from "@/lib/domain/types";

/*
 * Ce qui est vérifié ici tient en une phrase : une demande ne vaut que pour la campagne
 * qui vient de s'achever. Ouvrir la suivante doit donc y répondre toute seule, et une
 * demande ne doit jamais pouvoir survivre à ce qu'elle réclamait.
 */

const JOUR = 86_400_000;
const NOW = Date.parse("2026-10-25T10:00:00Z");

const campaign = (over: Partial<Campaign> = {}): Campaign =>
  ({ id: "cp_1", influencerId: "inf_1", seq: 1, name: "Automne", status: "completed", completedAt: NOW - JOUR, createdAt: 0, updatedAt: 0, ...over }) as Campaign;

const partner = (renewalAskedAt = 0): Influencer => ({ id: "inf_1", name: "Camille", renewalAskedAt }) as Influencer;

describe("fin de campagne et demande de la suivante", () => {
  it("ne dit rien tant qu'une campagne court", () => {
    const state = renewalState(partner(NOW), [campaign({ status: "active" }), campaign({ id: "cp_0", seq: 0 })]);
    expect(state.done).toBeNull();
    expect(state.canAsk).toBe(false);
    expect(state.asked).toBe(false);
  });

  it("ne dit rien à qui n'a jamais rien eu", () => {
    expect(renewalState(partner(), []).done).toBeNull();
    /* Une campagne annulée n'est pas une campagne qu'on a menée : rien à constater. */
    expect(renewalState(partner(), [campaign({ status: "cancelled" })]).done).toBeNull();
  });

  it("constate la fin, et ouvre le droit de redemander", () => {
    const state = renewalState(partner(), [campaign()]);
    expect(state.done?.id).toBe("cp_1");
    expect(state.canAsk).toBe(true);
    expect(state.asked).toBe(false);
  });

  it("retient la demande faite après la clôture", () => {
    const state = renewalState(partner(NOW), [campaign()]);
    expect(state.asked).toBe(true);
    expect(state.askedAt).toBe(NOW);
    /* Demandé une fois, plus rien à redemander. */
    expect(state.canAsk).toBe(false);
  });

  it("ignore une demande plus ancienne que la clôture", () => {
    /* Elle visait la campagne d'AVANT : celle-ci vient de se terminer, tout est à redire. */
    const state = renewalState(partner(NOW - 10 * JOUR), [campaign()]);
    expect(state.asked).toBe(false);
    expect(state.canAsk).toBe(true);
  });

  it("répond à la demande par la campagne suivante, sans rien refermer", () => {
    const asked = partner(NOW);
    expect(renewalState(asked, [campaign()]).asked).toBe(true);
    /* On lui ouvre sa participation suivante : la demande disparaît d'elle-même. */
    const after = renewalState(asked, [campaign(), campaign({ id: "cp_2", seq: 2, status: "draft", completedAt: undefined })]);
    expect(after.asked).toBe(false);
    expect(after.done).toBeNull();
  });

  it("retombe sur la date de mise à jour quand la clôture n'en a pas", () => {
    const vieille = campaign({ completedAt: undefined, updatedAt: NOW - 2 * JOUR });
    expect(renewalState(partner(NOW), [vieille]).asked).toBe(true);
    expect(renewalState(partner(NOW - 5 * JOUR), [vieille]).asked).toBe(false);
  });

  it("garde la plus récente des campagnes closes", () => {
    const state = renewalState(partner(), [campaign(), campaign({ id: "cp_2", seq: 2, completedAt: NOW - 5 * JOUR })]);
    expect(state.done?.id).toBe("cp_1");
  });

  it("liste les demandeurs, du plus ancien au plus récent", () => {
    const rows = pendingRenewals([
      { influencer: { ...partner(NOW), id: "b", name: "Zoé" }, campaigns: [campaign({ influencerId: "b" })] },
      { influencer: { ...partner(NOW - 2 * JOUR), id: "a", name: "Alix" }, campaigns: [campaign({ influencerId: "a", completedAt: NOW - 3 * JOUR })] },
      { influencer: { ...partner(), id: "c", name: "Chloé" }, campaigns: [campaign({ influencerId: "c" })] },
    ]);
    expect(rows.map((r) => r.influencer.id)).toEqual(["a", "b"]);
  });
});
