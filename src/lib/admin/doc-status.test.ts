import { describe, expect, it } from "vitest";
import type { BusinessDoc } from "@/lib/domain/types";
import { docStatus, needsAttention } from "./doc-status";

const doc = (id: string, expiresAt: string): BusinessDoc => ({
  id,
  title: id,
  kind: "certification",
  path: `documents/${id}/x.pdf`,
  filename: "x.pdf",
  mime: "application/pdf",
  size: 0,
  issuedAt: "",
  expiresAt,
  productSlug: "",
  isbn: "",
  reference: "",
  note: "",
  uploadedAt: 0,
  updatedAt: 0,
});

describe("docStatus", () => {
  it("sans échéance, rien à surveiller", () => {
    expect(docStatus("", "2026-09-15")).toBe("none");
  });

  it("alerte avant l'échéance, pas le jour venu", () => {
    expect(docStatus("2026-12-31", "2026-09-15")).toBe("valid");
    expect(docStatus("2026-10-30", "2026-09-15")).toBe("soon");
    // Le dernier jour de validité compte encore.
    expect(docStatus("2026-09-15", "2026-09-15")).toBe("soon");
    expect(docStatus("2026-09-14", "2026-09-15")).toBe("expired");
  });
});

describe("needsAttention", () => {
  it("ne garde que ce qui expire, la plus urgente d'abord", () => {
    const list = [doc("loin", "2027-01-01"), doc("sans", ""), doc("bientot", "2026-10-01"), doc("perime", "2026-01-01")];
    expect(needsAttention(list, "2026-09-15").map((d) => d.id)).toEqual(["perime", "bientot"]);
  });
});
