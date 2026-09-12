import { describe, expect, it } from "vitest";
import { fillContract, manualPlaceholders, placeholdersIn } from "./contract-template";

describe("variables d'un contrat", () => {
  it("relève chaque variable une fois, dans l'ordre", () => {
    expect(placeholdersIn("a {{B}} c {{A}} d {{B}}")).toEqual(["B", "A"]);
  });

  it("ne demande à l'admin que ce qui ne se calcule pas", () => {
    const text = "{{CREATOR_FIRST_NAME}} {{PRODUCTS_TOTAL_VALUE}} {{CAMPAIGN_END_DATE}} {{STATS_DELIVERY_DELAY}}";
    expect(manualPlaceholders(text)).toEqual(["CAMPAIGN_END_DATE", "STATS_DELIVERY_DELAY"]);
  });

  it("remplace, et ne laisse jamais d'accolades sous les yeux du signataire", () => {
    // Un contrat troué se voit ; un contrat à accolades fait douter de tout le reste.
    expect(fillContract("Payé {{X}} le {{Y}}", { X: "12 €" })).toBe("Payé 12 € le —");
    expect(fillContract("{{ X }}", { X: "espaces tolérés" })).toBe("espaces tolérés");
    expect(fillContract("{{X}}", { X: "   " })).toBe("—");
  });
});
