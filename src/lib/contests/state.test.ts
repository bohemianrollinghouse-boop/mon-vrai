import { describe, expect, it } from "vitest";
import { Contest, type ContestWinner } from "@/lib/domain/types";
import { contestState, hostOf, prizeSaid, seatsLeft, shared, shippable, totalParticipants, winnersOf } from "./state";

/*
 * L'état d'un concours se déduit — c'est ce qui garantit qu'il ne ment pas. Ces tests
 * sont donc surtout ceux de la frontière entre « le jeu court », « il faut tirer » et
 * « il reste un lot à envoyer » : les trois moments où l'écran demande quelque chose.
 */

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 8, 25);

const winner = (over: Partial<ContestWinner> = {}): ContestWinner => ({
  id: "win_1",
  hostId: "",
  handle: "@marie",
  name: "Marie Martin",
  email: "marie@exemple.fr",
  declaredBy: "admin",
  declaredAt: MAINTENANT,
  orderId: "",
  note: "",
  ...over,
});

const concours = (over: Record<string, unknown> = {}) =>
  Contest.parse({
    id: "cts_1",
    name: "Jeu de la rentrée",
    startAt: MAINTENANT - 7 * JOUR,
    endAt: MAINTENANT + 7 * JOUR,
    prize: { lines: [{ slug: "les-fruits", qty: 1 }], extra: "", deductStock: false },
    winnersWanted: 1,
    published: true,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

describe("L'état d'un concours", () => {
  it("reste un brouillon tant qu'il n'est pas publié, quelles que soient ses dates", () => {
    expect(contestState(concours({ published: false }), MAINTENANT)).toBe("draft");
  });

  it("attend son ouverture, puis court jusqu'au tirage", () => {
    expect(contestState(concours({ startAt: MAINTENANT + JOUR, endAt: MAINTENANT + 8 * JOUR }), MAINTENANT)).toBe("upcoming");
    expect(contestState(concours(), MAINTENANT)).toBe("live");
  });

  it("réclame le tirage dès la clôture passée, et lui seul", () => {
    const clos = concours({ endAt: MAINTENANT - JOUR });
    expect(contestState(clos, MAINTENANT)).toBe("drawing");
    /* Le même concours, gagnant déclaré : ce n'est plus le tirage qu'on attend. */
    expect(contestState(concours({ endAt: MAINTENANT - JOUR, winners: [winner()] }), MAINTENANT)).toBe("shipping");
  });

  it("n'est terminé qu'une fois tous les lots partis", () => {
    const base = { endAt: MAINTENANT - JOUR, winnersWanted: 2 };
    const un = winner({ id: "win_1", orderId: "ord_1" });
    const deux = winner({ id: "win_2", orderId: "" });
    expect(contestState(concours({ ...base, winners: [un, deux] }), MAINTENANT)).toBe("shipping");
    expect(contestState(concours({ ...base, winners: [un, { ...deux, orderId: "ord_2" }] }), MAINTENANT)).toBe("closed");
  });

  it("redemande un tirage quand on ouvre une place de plus", () => {
    const c = concours({ endAt: MAINTENANT - JOUR, winnersWanted: 2, winners: [winner({ orderId: "ord_1" })] });
    expect(contestState(c, MAINTENANT)).toBe("drawing");
    expect(seatsLeft(c)).toBe(1);
  });
});

describe("Les places d'un concours", () => {
  it("sont communes aux co-organisateurs : le premier qui déclare prend le lot", () => {
    const c = concours({
      winnersWanted: 2,
      hosts: [
        { id: "inf_1", influencerId: "inf_1", name: "Léa" },
        { id: "gst_2", influencerId: "", name: "Camille" },
      ],
      winners: [winner({ id: "win_1", hostId: "inf_1" }), winner({ id: "win_2", hostId: "inf_1" })],
    });
    expect(seatsLeft(c)).toBe(0);
    /* Les deux sont partis chez le même : rien ne réserve une place à personne. */
    expect(winnersOf(c, "inf_1")).toHaveLength(2);
    expect(winnersOf(c, "gst_2")).toHaveLength(0);
  });

  it("ne tombent jamais sous zéro, même si le nombre de lots est réduit après coup", () => {
    expect(seatsLeft(concours({ winnersWanted: 1, winners: [winner({ id: "a" }), winner({ id: "b" })] }))).toBe(0);
  });
});

describe("Ce qu'un concours dit de lui-même", () => {
  it("se sait partagé dès qu'un créateur le co-organise", () => {
    expect(shared(concours())).toBe(false);
    expect(shared(concours({ hosts: [{ id: "inf_1", influencerId: "inf_1", name: "Léa" }] }))).toBe(true);
  });

  it("additionne les participants des uns et des autres", () => {
    const c = concours({
      participants: 120,
      hosts: [
        { id: "inf_1", influencerId: "inf_1", name: "Léa", participants: 300 },
        { id: "gst_2", influencerId: "", name: "Camille", participants: 80 },
      ],
    });
    expect(totalParticipants(c)).toBe(500);
  });

  it("rattache un gagnant à celui qui l'a tiré, et personne quand il vient de nos réseaux", () => {
    const c = concours({ hosts: [{ id: "inf_1", influencerId: "inf_1", name: "Léa" }] });
    expect(hostOf(c, winner({ hostId: "inf_1" }))?.name).toBe("Léa");
    expect(hostOf(c, winner())).toBeNull();
  });

  it("n'a de lot que s'il met quelque chose en jeu", () => {
    expect(prizeSaid({ lines: [], extra: "" })).toBe(false);
    expect(prizeSaid({ lines: [], extra: "Un tote bag" })).toBe(true);
    expect(prizeSaid({ lines: [{ slug: "les-fruits", qty: 1 }], extra: "" })).toBe(true);
  });
});

describe("Un lot ne part que", () => {
  it("s'il y a une adresse, un e-mail, des livres — et qu'il n'est pas déjà parti", () => {
    expect(shippable(winner(), 2)).toBe(false); // sans adresse
    const joignable = winner({ address: { name: "Marie Martin", line1: "12 rue des Lilas", postalCode: "69003", city: "Lyon", country: "FR" } });
    expect(shippable(joignable, 2)).toBe(true);
    expect(shippable(joignable, 0)).toBe(false); // rien du catalogue dans le lot
    expect(shippable({ ...joignable, email: "" }, 2)).toBe(false);
    expect(shippable({ ...joignable, orderId: "ord_1" }, 2)).toBe(false);
  });
});
