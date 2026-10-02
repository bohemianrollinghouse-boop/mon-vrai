import { describe, expect, it } from "vitest";
import { FAR_FUTURE, monthEnd, resolveRange } from "./expense-ui";

const TODAY = "2026-09-15";

describe("monthEnd", () => {
  it("donne le dernier jour, quelle que soit la longueur du mois", () => {
    expect(monthEnd("2026-09")).toBe("2026-09-30");
    expect(monthEnd("2026-10")).toBe("2026-10-31");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
  });

  it("sait compter un février bissextile", () => {
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });
});

describe("resolveRange", () => {
  it("retombe sur l'année en cours quand rien n'est demandé", () => {
    const r = resolveRange({}, TODAY);
    expect(r.period?.key).toBe("annee");
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe(FAR_FUTURE);
  });

  it("borne une période glissante au futur lointain : une facture à venir reste visible", () => {
    expect(resolveRange({ periode: "30" }, TODAY).to).toBe(FAR_FUTURE);
  });

  it("prend un mois civil du 1er à son dernier jour", () => {
    const r = resolveRange({ mois: "2026-09" }, TODAY);
    expect([r.from, r.to]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(r.period).toBeNull();
    expect(r.label).toBe("septembre 2026");
  });

  it("prend des dates libres telles quelles", () => {
    const r = resolveRange({ du: "2026-03-03", au: "2026-03-18" }, TODAY);
    expect([r.from, r.to]).toEqual(["2026-03-03", "2026-03-18"]);
    expect(r.label).toBe("du 3 mars 2026 au 18 mars 2026");
  });

  it("remet deux bornes saisies à l'envers dans l'ordre", () => {
    const r = resolveRange({ du: "2026-03-18", au: "2026-03-03" }, TODAY);
    expect([r.from, r.to]).toEqual(["2026-03-03", "2026-03-18"]);
  });

  it("accepte une seule borne", () => {
    expect(resolveRange({ du: "2026-03-03" }, TODAY).to).toBe(FAR_FUTURE);
    expect(resolveRange({ au: "2026-03-18" }, TODAY).from).toBe("");
  });

  it("fait passer les dates libres avant le mois, et le mois avant la période", () => {
    expect(resolveRange({ periode: "30", mois: "2026-07", du: "2026-03-03", au: "2026-03-18" }, TODAY).from).toBe("2026-03-03");
    expect(resolveRange({ periode: "30", mois: "2026-07" }, TODAY).from).toBe("2026-07-01");
  });

  it("ignore ce qui ne ressemble pas à une date plutôt que de tomber", () => {
    expect(resolveRange({ mois: "2026-13" }, TODAY).period?.key).toBe("annee");
    expect(resolveRange({ mois: "septembre" }, TODAY).period?.key).toBe("annee");
    expect(resolveRange({ du: "hier", au: "demain" }, TODAY).period?.key).toBe("annee");
    expect(resolveRange({ du: ["2026-03-03"] }, TODAY).period?.key).toBe("annee");
  });
});
