import { beforeEach, describe, expect, it } from "vitest";
import { cleanUrl, publicationLabel, publicationLines, publicationProgress, publicationSlots, suggestPublications } from "./publications";
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

describe("suggestPublications", () => {
  const summary = [
    "40 photographies originales",
    "20 vidéos de 5 à 15 secondes",
    "1 réel Instagram",
    "* 2 stories Instagram",
    "Livres réellement manipulés, fichiers sans filigrane",
  ].join("\n");

  it("ne retient que ce qui nomme un réseau ou une forme de parution", () => {
    expect(suggestPublications(summary)).toEqual([
      { id: "", label: "Réel Instagram", qty: 1 },
      { id: "", label: "Stories Instagram", qty: 2 },
    ]);
  });

  it("laisse les fichiers à recevoir au décompte des fichiers", () => {
    expect(suggestPublications("40 photographies originales\n20 vidéos de 5 à 15 secondes")).toEqual([]);
  });

  it("lit la quantité en tête, « × » compris, et retombe sur une seule fois", () => {
    expect(suggestPublications("3 × vidéo TikTok")).toEqual([{ id: "", label: "Vidéo TikTok", qty: 3 }]);
    expect(suggestPublications("Story Instagram le jour de la réception")).toEqual([
      { id: "", label: "Story Instagram le jour de la réception", qty: 1 },
    ]);
  });

  it("ne propose pas deux fois la même ligne", () => {
    expect(suggestPublications("1 réel Instagram\nRéel Instagram")).toHaveLength(1);
  });
});

describe("publicationLines", () => {
  let n = 0;
  const nextId = () => `pub_${++n}`;
  const previous: ContractPublication[] = [{ id: "pub_ancien", label: "Vidéo TikTok", qty: 2 }];
  beforeEach(() => {
    n = 0;
  });

  it("pose un identifiant aux lignes neuves", () => {
    expect(publicationLines(JSON.stringify([{ id: "", label: "Story", qty: 1 }]), [], nextId)).toEqual([{ id: "pub_1", label: "Story", qty: 1 }]);
  });

  it("garde l'identifiant d'une ligne du contrat, même renommée : ses liens y tiennent", () => {
    const out = publicationLines(JSON.stringify([{ id: "pub_ancien", label: "Réel TikTok", qty: 2 }]), previous, nextId);
    expect(out).toEqual([{ id: "pub_ancien", label: "Réel TikTok", qty: 2 }]);
  });

  it("refait un identifiant que le client aurait inventé ou répété", () => {
    const out = publicationLines(
      JSON.stringify([{ id: "pub_ancien", label: "A", qty: 1 }, { id: "pub_ancien", label: "B", qty: 1 }, { id: "venu_dailleurs", label: "C", qty: 1 }]),
      previous,
      nextId,
    );
    expect(out.map((l) => l.id)).toEqual(["pub_ancien", "pub_1", "pub_2"]);
  });

  it("écarte les lignes sans nom et borne les quantités", () => {
    const out = publicationLines(JSON.stringify([{ label: "  ", qty: 1 }, { label: "Story", qty: 99 }, { label: "Post", qty: 0 }]), [], nextId);
    expect(out.map((l) => [l.label, l.qty])).toEqual([["Story", 20], ["Post", 1]]);
  });

  it("rend ce qui était là plutôt que de le jeter quand l'envoi est illisible", () => {
    expect(publicationLines("{pas du json", previous, nextId)).toEqual(previous);
    expect(publicationLines(JSON.stringify({ pas: "un tableau" }), previous, nextId)).toEqual(previous);
  });

  it("un champ vide veut dire « plus aucune parution », et non « ne touche à rien »", () => {
    expect(publicationLines("", previous, nextId)).toEqual([]);
  });
});
