import { describe, expect, it } from "vitest";
import { promoUsage, visibilityLabel } from "./promo-usage";
import type { Campaign, Promo } from "@/lib/domain/types";

/*
 * Ce qui est vérifié ici tient en deux phrases. Un code qu'une campagne porte encore ne
 * s'efface pas — il reviendrait au premier enregistrement. Et un partenaire ne voit
 * qu'UN code : celui de la campagne qui le fait vivre aujourd'hui, les autres existant
 * sans qu'il les voie jamais.
 */

const JOUR = 86_400_000;
const NOW = Date.parse("2026-10-25T10:00:00Z");

const campaign = (over: Partial<Campaign> = {}): Campaign =>
  ({
    id: "cp_1",
    influencerId: "inf_1",
    seq: 1,
    code: "CAMILLE10",
    discount: 10,
    startAt: NOW - 10 * JOUR,
    endAt: NOW + 10 * JOUR,
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Campaign;

const promo = (code = "CAMILLE10", influencerId = "inf_1"): Pick<Promo, "code" | "influencerId"> => ({ code, influencerId });

describe("ce qu'un code doit à ses campagnes", () => {
  it("nomme celles qui le portent, la plus récente d'abord", () => {
    const usage = promoUsage(promo(), [campaign(), campaign({ id: "cp_2", seq: 2 })], NOW);
    expect(usage.carriers.map((c) => c.id)).toEqual(["cp_2", "cp_1"]);
    expect(usage.orphan).toBe(false);
  });

  it("le dit orphelin quand plus aucune ne le porte", () => {
    /* La campagne a changé de code depuis : le document promo reste, sans parent. */
    const usage = promoUsage(promo(), [campaign({ code: "CAMILLE15" })], NOW);
    expect(usage.carriers).toHaveLength(0);
    expect(usage.orphan).toBe(true);
  });

  it("ne se laisse pas tromper par la casse", () => {
    expect(promoUsage(promo("camille10"), [campaign()], NOW).orphan).toBe(false);
  });
});

describe("ce que le partenaire en voit", () => {
  it("affiche celui de la campagne qui le fait vivre", () => {
    const usage = promoUsage(promo(), [campaign()], NOW);
    expect(usage.shown).toBe("CAMILLE10");
    expect(usage.visible).toBe(true);
  });

  it("n'en montre qu'un : le plus récent valable", () => {
    const campaigns = [campaign({ id: "vieux", seq: 1, code: "CAMILLE10" }), campaign({ id: "neuf", seq: 2, code: "CAMILLE15" })];
    expect(promoUsage(promo("CAMILLE15"), campaigns, NOW).visible).toBe(true);
    /* L'ancien existe toujours, et elle ne le voit nulle part. */
    const ancien = promoUsage(promo("CAMILLE10"), campaigns, NOW);
    expect(ancien.visible).toBe(false);
    expect(ancien.shown).toBe("CAMILLE15");
    expect(ancien.orphan).toBe(false);
  });

  it("survit à la clôture : c'est la date qui compte, pas le statut", () => {
    const close = campaign({ status: "completed", completedAt: NOW - JOUR });
    expect(promoUsage(promo(), [close], NOW).visible).toBe(true);
    /* Expirée, en revanche : elle ne voit plus rien. */
    expect(promoUsage(promo(), [campaign({ endAt: NOW - JOUR })], NOW).shown).toBe("");
  });

  it("ignore les campagnes des autres", () => {
    const usage = promoUsage(promo("ZOE10", "inf_2"), [campaign(), campaign({ id: "z", influencerId: "inf_2", code: "ZOE10" })], NOW);
    expect(usage.shown).toBe("ZOE10");
    expect(usage.visible).toBe(true);
  });

  it("le dit en français", () => {
    const campaigns = [campaign({ code: "CAMILLE15" })];
    expect(visibilityLabel(promoUsage(promo("CAMILLE15"), campaigns, NOW), "Camille")).toBe("Camille voit ce code dans son espace.");
    expect(visibilityLabel(promoUsage(promo("CAMILLE10"), campaigns, NOW), "Camille")).toBe(
      "Camille ne voit pas celui-ci : c'est CAMILLE15 que son espace affiche.",
    );
    expect(visibilityLabel(promoUsage(promo(), [campaign({ endAt: NOW - JOUR })], NOW), "Camille")).toBe(
      "Camille ne voit aucun code : aucune de ses campagnes n'en fait courir aujourd'hui.",
    );
  });
});
