import { describe, expect, it } from "vitest";
import {
  EMPTY_IG_SETTINGS,
  IgRule,
  decide,
  hasKeyword,
  normalise,
  ownComment,
  pickRule,
  shadowedRules,
  tokenDead,
  tokenLabel,
  tokenStale,
  variantFor,
  type IgSettings,
} from "./instagram";

/*
 * Ce fichier garde la seule partie du dispositif qui décide d'écrire à quelqu'un. Les
 * appels à Meta ne sont pas testés — ils ne décident rien ; ce qui compte est qu'une
 * règle se déclenche quand il faut, et surtout qu'elle NE se déclenche PAS quand il ne
 * faut pas.
 */

const rule = (over: Partial<IgRule> = {}): IgRule =>
  IgRule.parse({ id: "r1", name: "Règle", on: "comment", enabled: true, publicReplies: ["Merci !"], ...over });

const settings = (over: Partial<IgSettings> = {}): IgSettings => ({ ...EMPTY_IG_SETTINGS, enabled: true, dryRun: false, ...over });

describe("normalise", () => {
  it("ramène accents, casse et espaces à une forme comparable", () => {
    expect(normalise("  LIVRÉ   !! ")).toBe("livre !!");
    expect(normalise("Déjà vu")).toBe("deja vu");
  });
});

describe("hasKeyword", () => {
  it("reconnaît le mot quels que soient accents et casse", () => {
    expect(hasKeyword("Je veux le LIVRE !", "livre")).toBe(true);
    expect(hasKeyword("trop beau, le livré 😍", "livre")).toBe(true);
  });

  it("ne se déclenche pas sur un morceau de mot", () => {
    /* C'est le piège : « livre » dans « délivrer » enverrait un lien à qui n'a rien demandé. */
    expect(hasKeyword("il faut délivrer le colis", "livre")).toBe(false);
    expect(hasKeyword("un style livresque", "livre")).toBe(false);
  });

  it("accepte un emoji comme mot-clé", () => {
    expect(hasKeyword("je le veux 🙋 vite", "🙋")).toBe(true);
    expect(hasKeyword("rien ici", "🙋")).toBe(false);
  });

  it("accepte un mot-clé en plusieurs mots, espaces en trop compris", () => {
    expect(hasKeyword("coucou   JE  VEUX ça", "je veux")).toBe(true);
  });

  it("ignore un mot-clé vide plutôt que de tout attraper", () => {
    expect(hasKeyword("n'importe quoi", "   ")).toBe(false);
  });
});

describe("pickRule", () => {
  it("prend la première qui correspond, dans l'ordre écrit", () => {
    const rules = [rule({ id: "a", keywords: ["lien"] }), rule({ id: "b", keywords: ["livre"] })];
    expect(pickRule(rules, { kind: "comment", text: "le lien du livre ?" })?.id).toBe("a");
  });

  it("saute une règle éteinte", () => {
    const rules = [rule({ id: "a", keywords: ["livre"], enabled: false }), rule({ id: "b", keywords: ["livre"] })];
    expect(pickRule(rules, { kind: "comment", text: "le livre" })?.id).toBe("b");
  });

  it("ne mélange pas les portes d'entrée", () => {
    const rules = [rule({ id: "a", on: "message", keywords: [] })];
    expect(pickRule(rules, { kind: "comment", text: "coucou" })).toBeNull();
  });

  it("sans mot-clé, prend tout ce qui arrive par sa porte", () => {
    expect(pickRule([rule({ id: "a", keywords: [] })], { kind: "comment", text: "🧡" })?.id).toBe("a");
  });

  it("une règle visant des publications ne regarde qu'elles", () => {
    const rules = [rule({ id: "a", keywords: [], mediaIds: ["m1"] })];
    expect(pickRule(rules, { kind: "comment", text: "coucou", mediaId: "m1" })?.id).toBe("a");
    expect(pickRule(rules, { kind: "comment", text: "coucou", mediaId: "m2" })).toBeNull();
  });
});

describe("shadowedRules", () => {
  it("signale celles qu'une règle attrape-tout rend inutiles", () => {
    const rules = [rule({ id: "a", keywords: [] }), rule({ id: "b", keywords: ["livre"] })];
    expect(shadowedRules(rules)).toEqual(["b"]);
  });

  it("ne signale rien quand l'attrape-tout est en dernier", () => {
    const rules = [rule({ id: "a", keywords: ["livre"] }), rule({ id: "b", keywords: [] })];
    expect(shadowedRules(rules)).toEqual([]);
  });

  it("une règle ciblant des publications n'en masque aucune", () => {
    const rules = [rule({ id: "a", keywords: [], mediaIds: ["m1"] }), rule({ id: "b", keywords: ["livre"] })];
    expect(shadowedRules(rules)).toEqual([]);
  });

  it("l'attrape-tout d'une porte ne masque pas l'autre porte", () => {
    const rules = [rule({ id: "a", keywords: [] }), rule({ id: "b", on: "message", keywords: ["bonjour"] })];
    expect(shadowedRules(rules)).toEqual([]);
  });
});

describe("variantFor", () => {
  it("rend toujours la même formulation pour le même commentaire", () => {
    const v = ["un", "deux", "trois"];
    /* C'est ce qui fait qu'un webhook rejoué ne produit pas une seconde réponse différente. */
    expect(variantFor(v, "17841400000001")).toBe(variantFor(v, "17841400000001"));
  });

  it("alterne d'un commentaire à l'autre", () => {
    const v = ["un", "deux", "trois"];
    const seen = new Set(Array.from({ length: 30 }, (_, i) => variantFor(v, `1784140000${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("rend une chaîne vide quand rien n'est proposé", () => {
    expect(variantFor([], "x")).toBe("");
  });
});

describe("ownComment", () => {
  it("reconnaît nos propres commentaires", () => {
    expect(ownComment("123", "123")).toBe(true);
    expect(ownComment("456", "123")).toBe(false);
  });

  it("un auteur inconnu n'est pas nous", () => {
    expect(ownComment("", "123")).toBe(false);
  });
});

describe("decide", () => {
  const base = {
    incoming: { kind: "comment" as const, text: "je veux le livre", mediaId: "m1" },
    fromId: "visiteur",
    igUserId: "moi",
    sourceId: "c1",
    rules: [rule({ keywords: ["livre"], privateReply: "Voici le lien" })],
    settings: settings(),
    sentThisHour: 0,
  };

  it("répond quand tout est réuni", () => {
    const d = decide(base);
    expect(d.act).toBe(true);
    if (d.act) {
      expect(d.publicReply).toBe("Merci !");
      expect(d.privateReply).toBe("Voici le lien");
    }
  });

  it("ne fait rien quand le dispositif est éteint", () => {
    expect(decide({ ...base, settings: settings({ enabled: false }) })).toMatchObject({ act: false });
  });

  it("ignore nos propres commentaires — sinon le dispositif se répond à lui-même", () => {
    const d = decide({ ...base, fromId: "moi" });
    expect(d).toMatchObject({ act: false });
    if (!d.act) expect(d.reason).toMatch(/propre compte/i);
  });

  it("s'arrête au plafond horaire, mais dit quelle règle aurait agi", () => {
    const d = decide({ ...base, sentThisHour: 60, settings: settings({ hourlyCap: 60 }) });
    expect(d).toMatchObject({ act: false });
    if (!d.act) expect(d.reason).toMatch(/plafond/i);
  });

  it("n'agit pas quand la règle n'a rien à répondre", () => {
    const muette = rule({ keywords: ["livre"], publicReplies: [], privateReply: "" });
    expect(decide({ ...base, rules: [muette] })).toMatchObject({ act: false });
  });

  it("ne propose pas de réponse publique à un message privé", () => {
    const d = decide({
      ...base,
      incoming: { kind: "message", text: "bonjour", mediaId: "" },
      rules: [rule({ on: "message", keywords: [], publicReplies: ["Merci !"], privateReply: "Coucou !" })],
    });
    expect(d.act).toBe(true);
    if (d.act) {
      expect(d.publicReply).toBe("");
      expect(d.privateReply).toBe("Coucou !");
    }
  });
});

describe("le jeton", () => {
  const j = 24 * 60 * 60 * 1000;

  it("se renouvelle dix jours avant la fin, pas le dernier jour", () => {
    expect(tokenStale(100 * j, 0)).toBe(false);
    expect(tokenStale(5 * j, 0)).toBe(true);
  });

  it("distingue « à renouveler » de « mort »", () => {
    expect(tokenDead(5 * j, 0)).toBe(false);
    expect(tokenDead(0, 5 * j)).toBe(true);
  });

  it("se dit en jours", () => {
    expect(tokenLabel(42 * j, 0)).toBe("Connexion valable encore 42 jours");
    expect(tokenLabel(1 * j, 0)).toBe("Connexion valable encore 1 jour");
    expect(tokenLabel(0, 1 * j)).toBe("Connexion expirée");
  });
});
