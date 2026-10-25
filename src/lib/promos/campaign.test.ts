import { describe, expect, it } from "vitest";
import { campaignLive, codeCampaign, codeLive, currentCode, liveCampaign } from "./campaign";
import type { Campaign } from "@/lib/domain/types";

/*
 * Deux questions qu'on confondait, et qu'il fallait séparer : « qu'est-ce que ce
 * partenaire a sur le feu ? » et « son code remise-t-il encore ? ».
 *
 * La première suit le STATUT — une campagne close ne propose plus ni kit ni contrat.
 * La seconde suit les DATES — ce qu'on a annoncé à sa communauté tient jusqu'au jour
 * dit, et clore la collaboration n'y change rien.
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
    endAt: NOW + 30 * JOUR,
    status: "active",
    createdAt: NOW - 10 * JOUR,
    updatedAt: NOW,
    ...over,
  }) as Campaign;

describe("ce que le partenaire a sur le feu", () => {
  it("s'arrête à la clôture", () => {
    expect(campaignLive(campaign(), NOW)).toBe(true);
    expect(campaignLive(campaign({ status: "completed" }), NOW)).toBe(false);
    expect(campaignLive(campaign({ status: "cancelled" }), NOW)).toBe(false);
  });

  it("prend celle en cours, sinon la dernière ouverte", () => {
    expect(liveCampaign([campaign({ id: "b", status: "draft" }), campaign({ id: "a", status: "active" })])?.id).toBe("a");
    expect(liveCampaign([campaign({ status: "completed" })])).toBeNull();
  });
});

describe("ce que sa communauté peut encore utiliser", () => {
  it("survit à la clôture : la date annoncée fait foi", () => {
    const close = campaign({ status: "completed", completedAt: NOW - JOUR });
    expect(campaignLive(close, NOW)).toBe(false);
    expect(codeLive(close, NOW)).toBe(true);
  });

  it("s'arrête au jour dit, et pas avant", () => {
    expect(codeLive(campaign({ endAt: NOW + 1 }), NOW)).toBe(true);
    expect(codeLive(campaign({ endAt: NOW - 1 }), NOW)).toBe(false);
    /* Pas encore commencée : elle ne remise pas non plus. */
    expect(codeLive(campaign({ startAt: NOW + JOUR }), NOW)).toBe(false);
  });

  it("meurt avec une campagne annulée : la contrepartie n'a jamais été remise", () => {
    expect(codeLive(campaign({ status: "cancelled" }), NOW)).toBe(false);
  });

  it("court sans fin quand aucune date de fin n'a été donnée", () => {
    expect(codeLive(campaign({ endAt: undefined, status: "completed" }), NOW)).toBe(true);
  });

  it("se rallume en rouvrant une campagne avec la même personne", () => {
    /* La dernière close est expirée : plus rien ne remise. */
    const expiree = campaign({ status: "completed", endAt: NOW - JOUR });
    expect(codeCampaign([expiree], NOW)).toBeNull();
    /* On lui rouvre une campagne : son code revit, sans que personne y touche. */
    const neuve = campaign({ id: "cp_2", seq: 2, status: "draft", endAt: NOW + 30 * JOUR });
    expect(codeCampaign([neuve, expiree], NOW)?.id).toBe("cp_2");
  });

  it("ignore une campagne qui ne porte aucun code", () => {
    expect(codeCampaign([campaign({ code: "" })], NOW)).toBeNull();
  });

  it("laisse currentCode répondre pour ce qui est en cours", () => {
    /* `currentCode` suit la campagne vivante : c'est ce que l'admin propose par défaut. */
    expect(currentCode([campaign()])).toBe("CAMILLE10");
    expect(currentCode([campaign({ status: "completed" })])).toBe("");
  });
});
