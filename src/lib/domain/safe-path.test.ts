import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-path";

describe("safeInternalPath", () => {
  it("accepte un chemin interne, avec ses paramètres", () => {
    expect(safeInternalPath("/compte")).toBe("/compte");
    expect(safeInternalPath("/livres/le-visage?x=1#haut")).toBe("/livres/le-visage?x=1#haut");
  });

  it("refuse tout ce qui sort du site", () => {
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("/\\\\evil.com/x")).toBe("/");
    expect(safeInternalPath("/ /evil.com")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("retombe sur la valeur par défaut pour une entrée absente ou vide", () => {
    expect(safeInternalPath(undefined, "/compte")).toBe("/compte");
    expect(safeInternalPath("", "/compte")).toBe("/compte");
    expect(safeInternalPath(["/a"], "/compte")).toBe("/compte");
  });
});
