import { describe, expect, it } from "vitest";
import type { Campaign } from "@/lib/domain/types";
import { codeCandidates, lastCode, operationState } from "./operation";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe("état d'une campagne", () => {
  it("se déduit des dates, sans statut à tenir à jour", () => {
    expect(operationState({ startAt: NOW + DAY, endAt: NOW + 30 * DAY }, NOW)).toBe("upcoming");
    expect(operationState({ startAt: NOW - DAY, endAt: NOW + DAY }, NOW)).toBe("live");
    expect(operationState({ startAt: NOW - 30 * DAY, endAt: NOW - DAY }, NOW)).toBe("over");
  });

  it("court encore le jour de sa fin", () => {
    expect(operationState({ startAt: NOW - DAY, endAt: NOW }, NOW)).toBe("live");
  });
});

describe("codes proposés à un participant", () => {
  const partner = { handle: "@marie.lit", name: "Marie Durand", previous: "" };

  it("propose d'abord son code précédent : sa communauté le connaît", () => {
    expect(codeCandidates({ ...partner, previous: "MARIE15" }, 10)[0]).toBe("MARIE15");
  });

  it("dérive du pseudo, accents et ponctuation retirés, remise en suffixe", () => {
    expect(codeCandidates({ handle: "@léa_créa", name: "Léa", previous: "" }, 10)[0]).toBe("LEACREA10");
  });

  it("retombe sur le nom quand il n'y a pas de pseudo", () => {
    expect(codeCandidates({ handle: "", name: "Marie Durand", previous: "" }, 20)[0]).toBe("MARIEDURAND20");
  });

  it("numérote les suivants, pour qu'un code déjà pris ne bloque pas", () => {
    const list = codeCandidates(partner, 10);
    expect(list[0]).toBe("MARIELIT10");
    expect(list[1]).toBe("MARIELIT102");
    expect(new Set(list).size).toBe(list.length);
  });

  it("ne propose que des codes valides, même sans pseudo ni nom exploitables", () => {
    const list = codeCandidates({ handle: "???", name: "!!!", previous: "  " }, 0);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((c) => /^[A-Z0-9]{2,24}$/.test(c))).toBe(true);
    expect(list[0]).toBe("PARTENAIRE0");
  });

  it("ne dépasse jamais 24 caractères", () => {
    const list = codeCandidates({ handle: "unpseudoterriblementlongpourtenir", name: "", previous: "" }, 15);
    expect(list.every((c) => c.length <= 24)).toBe(true);
  });
});

describe("dernier code porté", () => {
  const stub = (code: string): Campaign => ({ code }) as Campaign;

  it("prend le premier code non vide de la liste, la plus récente en tête", () => {
    expect(lastCode([stub(""), stub("MARIE10"), stub("MARIE05")])).toBe("MARIE10");
    expect(lastCode([stub(""), stub("")])).toBe("");
    expect(lastCode([])).toBe("");
  });
});
