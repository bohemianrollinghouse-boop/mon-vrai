import { describe, expect, it } from "vitest";
import { nextVersion } from "./contract-version";

describe("version suivante d'un contrat", () => {
  it("incrémente le suffixe qu'elle trouve", () => {
    expect(nextVersion("UGC-2026-09-v1")).toBe("UGC-2026-09-v2");
    expect(nextVersion("UGC-2026-09-v9")).toBe("UGC-2026-09-v10");
    expect(nextVersion("UGC v3")).toBe("UGC-v4");
  });

  it("en pose un quand il n'y en a pas", () => {
    expect(nextVersion("UGC-2026-09")).toBe("UGC-2026-09-v2");
    expect(nextVersion("")).toBe("v2");
  });

  it("saute ce qui est déjà pris : une version ne se réutilise jamais", () => {
    expect(nextVersion("UGC-v1", ["UGC-v2", "UGC-v3"])).toBe("UGC-v4");
    /* La casse ne fait pas une version différente. */
    expect(nextVersion("UGC-v1", ["ugc-V2"])).toBe("UGC-v3");
  });
});
