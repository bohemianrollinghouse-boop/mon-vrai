import { describe, expect, it } from "vitest";
import { fillContract, manualPlaceholders, placeholdersIn, renderContract } from "./contract-template";

describe("variables d'un contrat", () => {
  it("relève chaque variable une fois, dans l'ordre", () => {
    expect(placeholdersIn("a {{B}} c {{A}} d {{B}}")).toEqual(["B", "A"]);
  });

  it("ne demande à l'admin que ce qui ne se calcule pas", () => {
    const text = "{{CREATOR_FIRST_NAME}} {{PRODUCTS_TOTAL_VALUE}} {{CAMPAIGN_END_DATE}} {{STATS_DELIVERY_DELAY}}";
    /* CAMPAIGN_END_DATE a rejoint les variables calculées : elle vient des dates de la campagne. */
    expect(manualPlaceholders(text)).toEqual(["STATS_DELIVERY_DELAY"]);
  });

  it("remplace, et ne laisse jamais d'accolades sous les yeux du signataire", () => {
    // Un contrat à accolades fait douter de tout le reste.
    expect(fillContract("Payé {{X}} le {{Y}}", { X: "12 €" })).toBe("Payé 12 € le non défini");
    expect(fillContract("{{ X }}", { X: "espaces tolérés" })).toBe("espaces tolérés");
    expect(fillContract("{{X}}", { X: "   " })).toBe("non défini");
  });
});

describe("renderContract", () => {
  it("efface la rubrique ET son intitulé quand la variable est vide", () => {
    const text = "Article 7\n\nPlateformes prévues :\n**{{PUBLICATION_PLATFORMS}}**\n\nSuite du contrat.";
    expect(renderContract(text, {})).toBe("Article 7\n\nSuite du contrat.");
  });

  it("garde la rubrique dès que la variable est renseignée", () => {
    const text = "Plateformes prévues :\n**{{PUBLICATION_PLATFORMS}}**";
    expect(renderContract(text, { PUBLICATION_PLATFORMS: "Instagram" })).toBe("Plateformes prévues :\n**Instagram**");
  });

  it("efface aussi une ligne « intitulé : variable »", () => {
    expect(renderContract("Instagram : **{{IG}}**\nTikTok : **{{TT}}**", { TT: "@moi" })).toBe("TikTok : **@moi**");
  });

  it("écrit « non défini » au milieu d'une phrase, où supprimer perdrait la clause", () => {
    const text = "Les publications interviennent dans un délai de **{{DELAI}} jours** suivant la réception.";
    expect(renderContract(text, {})).toContain("dans un délai de **non défini jours** suivant la réception");
  });

  it("écrit « non défini » pour une variable déclarée obligatoire, même seule", () => {
    const text = "Statut des produits :\n**{{PRODUCT_STATUS}}**";
    expect(renderContract(text, {}, ["PRODUCT_STATUS"])).toBe("Statut des produits :\n**non défini**");
  });

  it("ne laisse pas deux lignes vides là où une rubrique a disparu", () => {
    const text = "Avant.\n\nIntitulé :\n**{{X}}**\n\nAprès.";
    expect(renderContract(text, {})).toBe("Avant.\n\nAprès.");
  });
});

describe("rubriques ponctuées", () => {
  it("efface une rubrique dont la ligne finit par une virgule", () => {
    // « raison sociale / SIRET le cas échéant : {{X}}, » — le cas d'un particulier.
    const text = "agissant en qualité de **particulier**,\nraison sociale / SIRET le cas échéant : **{{CREATOR_COMPANY_DETAILS}}**,\nci-après dénommé(e).";
    expect(renderContract(text, {})).toBe("agissant en qualité de **particulier**,\nci-après dénommé(e).");
  });
});
