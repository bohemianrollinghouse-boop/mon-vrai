import { describe, expect, it } from "vitest";
import { cleanUrl, publicationLabel, publicationProgress, publicationSlots } from "./publications";
import type { CampaignPublication, ContractPublication } from "@/lib/domain/types";

const required: ContractPublication[] = [
  { id: "p1", label: "Vidéo TikTok", qty: 2 },
  { id: "p2", label: "Story Instagram", qty: 1 },
];
const slots = (recorded: CampaignPublication[] = []) => publicationSlots(required, recorded);

describe("publicationSlots", () => {
  it("déplie les quantités : deux vidéos font deux cases", () => {
    expect(slots().map((s) => s.key)).toEqual(["p1#0", "p1#1", "p2#0"]);
    expect(slots()[1]).toMatchObject({ label: "Vidéo TikTok", index: 1, qty: 2, done: false, url: "" });
  });

  it("rattache un lien à sa case", () => {
    const [, second] = slots([{ key: "p1#1", done: false, url: "https://tiktok.com/@a/video/2" }]);
    expect(second.url).toBe("https://tiktok.com/@a/video/2");
  });

  it("tient un lien pour preuve, même la case décochée", () => {
    expect(slots([{ key: "p1#0", done: false, url: "https://x.test/1" }])[0].done).toBe(true);
  });

  it("accepte une parution constatée sans lien", () => {
    expect(slots([{ key: "p2#0", done: true, url: "" }])[2].done).toBe(true);
  });

  it("ignore ce qui ne correspond à aucune ligne du contrat, sans s'en plaindre", () => {
    expect(slots([{ key: "disparue#0", done: true, url: "https://x.test/1" }])).toHaveLength(3);
  });
});

describe("publicationProgress", () => {
  it("compte ce qui est paru et ce dont le lien manque", () => {
    const p = publicationProgress(slots([{ key: "p1#0", done: true, url: "" }, { key: "p1#1", done: false, url: "https://x.test/2" }]));
    expect(p).toMatchObject({ done: 2, total: 3, withoutUrl: 1, required: true, complete: false });
    expect(publicationLabel(p)).toBe("2 parutions sur 3");
  });

  it("ne dit rien quand le contrat n'exige aucune parution", () => {
    const p = publicationProgress(publicationSlots([], []));
    expect(p.required).toBe(false);
    expect(publicationLabel(p)).toBe("");
  });

  it("signale les liens encore à récupérer une fois tout paru", () => {
    const all: CampaignPublication[] = [
      { key: "p1#0", done: true, url: "" },
      { key: "p1#1", done: true, url: "https://x.test/2" },
      { key: "p2#0", done: true, url: "" },
    ];
    expect(publicationLabel(publicationProgress(slots(all)))).toBe("Tout est paru · 2 liens à récupérer");
  });
});

describe("cleanUrl", () => {
  it("accepte une adresse web et rend le vide tel quel", () => {
    expect(cleanUrl(" https://www.tiktok.com/@a/video/1 ")).toBe("https://www.tiktok.com/@a/video/1");
    expect(cleanUrl("   ")).toBe("");
  });

  it("refuse ce qui n'est pas une adresse web", () => {
    expect(cleanUrl("tiktok.com/@moi")).toBeNull();
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
  });
});
