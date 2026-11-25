import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERSO_PAGES } from "./perso-pages";

const root = process.cwd();

describe("pages perso", () => {
  it("chaque page du registre a sa route et son fichier", () => {
    for (const p of PERSO_PAGES) {
      expect(existsSync(path.join(root, "src", "app", ...p.path.split("/").filter(Boolean), "route.ts")), p.path).toBe(true);
      expect(existsSync(path.join(root, p.file)), p.file).toBe(true);
    }
  });

  it("chaque route sous /perso est notée au registre", () => {
    const dirs = readdirSync(path.join(root, "src", "app", "perso"));
    expect(dirs.map((d) => `/perso/${d}`).sort()).toEqual(PERSO_PAGES.map((p) => p.path).sort());
  });
});
