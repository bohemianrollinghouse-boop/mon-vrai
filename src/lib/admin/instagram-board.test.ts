import { describe, expect, it } from "vitest";
import { boardState, eventLine, reallySent, ruleSummary, shadowWarning } from "./instagram-board";
import { EMPTY_IG_SETTINGS, IgEvent, IgRule, type IgSettings } from "@/lib/domain/instagram";

const rule = (over: Partial<IgRule> = {}): IgRule => IgRule.parse({ id: "r1", name: "Règle", publicReplies: ["Merci"], ...over });
const settings = (over: Partial<IgSettings> = {}): IgSettings => ({ ...EMPTY_IG_SETTINGS, ...over });
const event = (over: Partial<IgEvent> = {}): IgEvent => IgEvent.parse({ id: "e1", at: 0, kind: "comment", ...over });

describe("boardState", () => {
  it("distingue les trois situations, l'essai à blanc compris", () => {
    expect(boardState(settings(), false).label).toBe("Aucun compte");
    expect(boardState(settings({ enabled: false }), true).label).toBe("Éteint");
    /* Le cas trompeur : tout semble marcher et personne ne reçoit rien. */
    expect(boardState(settings({ enabled: true, dryRun: true }), true).label).toBe("Essai à blanc");
    expect(boardState(settings({ enabled: true, dryRun: false }), true).label).toBe("Actif");
  });
});

describe("ruleSummary", () => {
  it("dit la porte, l'étendue et ce qui part", () => {
    expect(ruleSummary(rule({ keywords: ["a", "b"], privateReply: "salut" }))).toBe("Commentaire · 2 mots-clés · public et privé");
  });

  it("dit « tous » quand aucun mot-clé ne restreint", () => {
    expect(ruleSummary(rule({ keywords: [] }))).toBe("Commentaire · tous · public");
  });

  it("compte les publications visées quand il y en a", () => {
    expect(ruleSummary(rule({ keywords: ["a"], mediaIds: ["m1", "m2"] }))).toContain("2 publications");
  });

  it("ne cache pas une règle qui n'a rien à répondre", () => {
    expect(ruleSummary(rule({ publicReplies: [] }))).toContain("rien à répondre");
  });
});

describe("shadowWarning", () => {
  it("ne dit rien quand tout peut se déclencher", () => {
    expect(shadowWarning([rule({ id: "a", keywords: ["x"] })])).toBe("");
  });

  it("nomme celles qui ne serviront jamais", () => {
    const w = shadowWarning([rule({ id: "a", keywords: [] }), rule({ id: "b", name: "Lien", keywords: ["x"] })]);
    expect(w).toContain("« Lien »");
  });
});

describe("eventLine", () => {
  it("dit ce qui serait parti en essai à blanc, sans laisser croire que c'est parti", () => {
    const line = eventLine(event({ dryRun: true, actions: [{ kind: "privateReply", text: "x", ok: false, error: "" }] }));
    expect(line.what).toBe("Aurait répondu en privé");
    expect(line.tone).toBe("blue");
  });

  it("dit l'échec quand rien n'est passé", () => {
    const line = eventLine(event({ actions: [{ kind: "publicReply", text: "x", ok: false, error: "quota dépassé" }] }));
    expect(line.what).toContain("quota dépassé");
  });

  it("dit la réussite, et signale l'autre moitié quand elle a échoué", () => {
    const line = eventLine(
      event({
        actions: [
          { kind: "privateReply", text: "x", ok: true, error: "" },
          { kind: "publicReply", text: "y", ok: false, error: "commentaire supprimé" },
        ],
      }),
    );
    expect(line.what).toContain("Répondu en privé");
    expect(line.what).toContain("commentaire supprimé");
  });

  it("répète le motif quand rien n'a été fait", () => {
    expect(eventLine(event({ skipped: "Aucune règle ne correspond" })).what).toBe("Aucune règle ne correspond");
  });
});

describe("reallySent", () => {
  it("ne compte pas les essais à blanc — c'est tout l'intérêt de les distinguer", () => {
    const events = [
      event({ id: "a", actions: [{ kind: "privateReply", text: "x", ok: true, error: "" }] }),
      event({ id: "b", dryRun: true, actions: [{ kind: "privateReply", text: "x", ok: false, error: "" }] }),
      event({ id: "c", skipped: "rien" }),
    ];
    expect(reallySent(events)).toBe(1);
  });
});
