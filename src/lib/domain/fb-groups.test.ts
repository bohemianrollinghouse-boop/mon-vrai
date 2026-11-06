import { describe, expect, it } from "vitest";
import {
  addedToday,
  applyScan,
  newComments,
  scanFrom,
  aggregateClicks,
  applyPatch,
  ApiNewGroup,
  ApiPatch,
  browserFromUa,
  checkStaff,
  profileUrlFrom,
  toPatch,
  conversationUrlFrom,
  mergeStaff,
  staffAutoReply,
  staffKey,
  applyStaffContact,
  applyStaffReply,
  conversationScanFrom,
  staffReplied,
  staffReplyState,
  staffContactState,
  matchesStaffFilters,
  ApiStaffContact,
  membershipScanFrom,
  membershipFromScan,
  applyMembershipScan,
  type FbStaff,
  checkMessage,
  fillMessage,
  FbGroup,
  groupRoot,
  staffUrl,
  groupSlug,
  groupStage,
  isDuplicate,
  isRobot,
  landingPathFrom,
  osFromUa,
  postUrlFrom,
  refererFamily,
  sameName,
  statsByGroup,
  trackingLink,
  type FbClick,
} from "./fb-groups";

const IPHONE_FB =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/455.0.0.39.109;FBBV/1]";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const group = (over: Partial<FbGroup> = {}): FbGroup =>
  FbGroup.parse({ slug: "parents-lyon", name: "Parents Lyon", groupUrl: "https://www.facebook.com/groups/123", createdAt: 1, updatedAt: 1, ...over });

describe("groupRoot", () => {
  it("ramène n'importe quelle page d'un groupe à sa racine", () => {
    expect(groupRoot("https://www.facebook.com/groups/123/posts/456?ref=share")).toBe("https://www.facebook.com/groups/123");
    expect(groupRoot("https://m.facebook.com/groups/mamans.paris/about")).toBe("https://www.facebook.com/groups/mamans.paris");
    expect(groupRoot(" https://web.facebook.com/groups/abc ")).toBe("https://www.facebook.com/groups/abc");
  });
  it("déduit de n'importe quel lien du groupe la page de ses admins", () => {
    expect(staffUrl("https://www.facebook.com/groups/123/posts/456?ref=share")).toBe("https://www.facebook.com/groups/123/members/admins");
    expect(staffUrl("https://m.facebook.com/groups/mamans.paris/about")).toBe("https://www.facebook.com/groups/mamans.paris/members/admins");
    expect(staffUrl("https://evil.com/groups/123")).toBeNull();
  });
  it("refuse ce qui n'est pas un groupe", () => {
    expect(groupRoot("https://www.facebook.com/monvrai")).toBeNull();
    expect(groupRoot("https://www.facebook.com/groups/feed/")).toBeNull();
    expect(groupRoot("https://evil.com/groups/123")).toBeNull();
    expect(groupRoot("https://facebook.com.evil.com/groups/123")).toBeNull();
    expect(groupRoot("pas une adresse")).toBeNull();
  });
});

describe("slug, nom, lien", () => {
  it("tire le slug du nom, sinon de l'adresse", () => {
    expect(groupSlug("Mamans & Papas de Lyon 👶", "https://www.facebook.com/groups/1")).toBe("mamans-papas-de-lyon");
    expect(groupSlug("👶👶", "https://www.facebook.com/groups/987654")).toBe("987654");
  });
  it("reconnaît le même nom malgré casse et accents", () => {
    expect(sameName("Éveil des bébés", "eveil des Bebes")).toBe(true);
    expect(sameName("Éveil", "Éveil bébé")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });
  it("construit le lien de suivi sur la page d'arrivée", () => {
    expect(trackingLink("https://monvrai.fr/", "/", "parents-lyon")).toBe("https://monvrai.fr/?fb=parents-lyon");
    expect(trackingLink("https://monvrai.fr", "/catalogue", "a")).toBe("https://monvrai.fr/catalogue?fb=a");
    expect(trackingLink("https://monvrai.fr", "//evil.com", "a")).toBe("https://monvrai.fr/?fb=a");
  });
  it("n'accepte comme page d'arrivée qu'un chemin du site public", () => {
    expect(landingPathFrom("")).toBe("/");
    expect(landingPathFrom("/le-concept")).toBe("/le-concept");
    expect(landingPathFrom("https://evil.com")).toBeNull();
    expect(landingPathFrom("/admin")).toBeNull();
    expect(landingPathFrom("/catalogue?x=1")).toBeNull();
  });
});

describe("message", () => {
  it("remplace chaque {lien}", () => {
    expect(fillMessage("Voir {lien} — encore {lien}", "https://x/?fb=a")).toBe("Voir https://x/?fb=a — encore https://x/?fb=a");
  });
  it("exige {lien} et refuse l'adresse du site écrite en dur", () => {
    expect(checkMessage("  Bonjour {lien}\r\n ")).toEqual({ ok: true, text: "Bonjour {lien}" });
    expect(checkMessage("Bonjour").ok).toBe(false);
    expect(checkMessage("").ok).toBe(false);
    expect(checkMessage("Allez sur monvrai.fr {lien}").ok).toBe(false);
    expect(checkMessage("Allez sur https://www.monvrai.fr/catalogue {lien}").ok).toBe(false);
    expect(checkMessage("x".repeat(5001) + "{lien}").ok).toBe(false);
  });
  it("n'accepte un lien de post que de Facebook", () => {
    expect(postUrlFrom("")).toBeNull();
    expect(postUrlFrom("https://www.facebook.com/groups/1/posts/2")).toBe("https://www.facebook.com/groups/1/posts/2");
    expect(() => postUrlFrom("https://evil.com/x")).toThrow();
  });
});

describe("applyPatch", () => {
  it("un premier post part en attente et fait passer le groupe dans « Fait »", () => {
    const g = applyPatch(group(), { postUrl: "https://www.facebook.com/groups/1/posts/2" }, 10);
    expect(g.postStatus).toBe("pending");
    expect(g.status).toBe("handled");
    expect(g.updatedAt).toBe(10);
  });
  it("ne déplace pas un groupe qu'on range explicitement ailleurs", () => {
    const g = applyPatch(group(), { postUrl: "https://www.facebook.com/x", status: "ignored" }, 10);
    expect(g.status).toBe("ignored");
  });
  it("retirer le lien retire son état ; changer d'état sans post ne fait rien", () => {
    const posted = group({ postUrl: "https://www.facebook.com/x", postStatus: "validated", status: "handled" });
    expect(applyPatch(posted, { postUrl: null }, 2).postStatus).toBeNull();
    expect(applyPatch(group(), { postStatus: "validated" }, 2).postStatus).toBeNull();
    expect(applyPatch(posted, { postStatus: "deleted" }, 2).postStatus).toBe("deleted");
  });
  it("date le message, et l'efface avec sa date", () => {
    expect(applyPatch(group(), { message: "a {lien}" }, 5).messageAt).toBe(5);
    expect(applyPatch(group({ message: "a", messageAt: 5 }), { message: null }, 6).messageAt).toBeNull();
  });
});

describe("admins et modérateurs", () => {
  it("ramène un lien de profil à sa forme stable", () => {
    expect(profileUrlFrom("https://m.facebook.com/profile.php?id=1000123&__cft__[0]=AZX&__tn__=R")).toBe("https://www.facebook.com/profile.php?id=1000123");
    expect(profileUrlFrom("https://www.facebook.com/groups/mamans.lyon/user/1000123/?__cft__[0]=x")).toBe("https://www.facebook.com/groups/mamans.lyon/user/1000123");
    expect(profileUrlFrom("https://web.facebook.com/claire.martin.75/")).toBe("https://www.facebook.com/claire.martin.75");
    expect(profileUrlFrom("https://www.facebook.com/people/Claire-Martin/61550000000000/")).toBe("https://www.facebook.com/people/Claire-Martin/61550000000000");
  });
  it("refuse ce qui n'est pas un profil", () => {
    expect(profileUrlFrom("https://www.facebook.com/groups/123")).toBeNull();
    expect(profileUrlFrom("https://www.facebook.com/groups/123/posts/4")).toBeNull();
    expect(profileUrlFrom("https://www.facebook.com/watch")).toBeNull();
    expect(profileUrlFrom("https://www.facebook.com/profile.php")).toBeNull();
    expect(profileUrlFrom("https://evil.com/claire")).toBeNull();
    expect(profileUrlFrom("pas un lien")).toBeNull();
  });
  it("valide la liste en nommant la ligne fautive, et ne garde chacun qu'une fois", () => {
    const staff = checkStaff([
      { name: " Claire ", role: "admin", profileUrl: "https://m.facebook.com/profile.php?id=1&__tn__=R" },
      { name: "Claire M.", role: "admin", profileUrl: "https://www.facebook.com/profile.php?id=1" },
      { name: "Paul", role: "moderator" },
    ]);
    expect(staff).toEqual([
      { name: "Claire", role: "admin", profileUrl: "https://www.facebook.com/profile.php?id=1" },
      { name: "Paul", role: "moderator", profileUrl: null },
    ]);
    expect(() => checkStaff([{ name: "A", role: "admin" }, { name: "B", role: "admin", profileUrl: "https://www.facebook.com/groups/1" }])).toThrow(/staff\[1\]\.profileUrl/);
    expect(() => checkStaff([{ name: " ", role: "admin" }])).toThrow(/staff\[0\]\.name/);
  });
  it("l'API exige le rôle, refuse un champ inconnu, et date la liste", () => {
    expect(ApiNewGroup.safeParse({ url: "u", name: "n", staff: [{ name: "Claire" }] }).success).toBe(false);
    expect(ApiPatch.safeParse({ staff: [{ name: "Claire", role: "admin", url: "x" }] }).success).toBe(false);
    const parsed = ApiPatch.parse({ staff: [{ name: "Claire", role: "moderator", profileUrl: "https://www.facebook.com/claire" }] });
    const g = applyPatch(group(), toPatch(parsed, "monvrai.fr"), 9);
    expect(g.staff).toEqual([{ name: "Claire", role: "moderator", profileUrl: "https://www.facebook.com/claire" }]);
    expect(g.staffAt).toBe(9);
    expect(applyPatch(g, toPatch(ApiPatch.parse({ staff: [] }), "monvrai.fr"), 10).staff).toEqual([]);
  });
  it("un groupe d'avant se relit sans liste", () => {
    expect(group().staff).toEqual([]);
    expect(group().staffAt).toBeNull();
  });
});

describe("contacts des admins", () => {
  const claire = { name: "Claire", role: "admin" as const, profileUrl: "https://www.facebook.com/claire" };
  const conv = "https://www.facebook.com/messages/t/1";
  const reply = conversationScanFrom({ state: "ok", theirs: 1, mine: 1, lastFrom: "them", lastText: "Avec plaisir !", lastKey: "1|Avec" }, 3);
  const known: FbStaff[] = [{ ...claire, conversationUrl: conv, contactedAt: 100, contactMessage: "Bonjour Claire", reply }];

  it("ramène un lien de conversation à sa forme facebook.com, messenger.com compris", () => {
    expect(conversationUrlFrom("https://www.facebook.com/messages/t/100004567890123/?ref=x#y")).toBe("https://www.facebook.com/messages/t/100004567890123");
    expect(conversationUrlFrom("https://www.messenger.com/t/claire.martin")).toBe("https://www.facebook.com/messages/t/claire.martin");
    expect(conversationUrlFrom("https://www.messenger.com/e2ee/t/123456")).toBe("https://www.facebook.com/messages/e2ee/t/123456");
    expect(conversationUrlFrom("https://web.facebook.com/messages/e2ee/t/42")).toBe("https://www.facebook.com/messages/e2ee/t/42");
    expect(conversationUrlFrom("  ")).toBeNull();
    expect(conversationUrlFrom(null)).toBeNull();
    expect(() => conversationUrlFrom("https://www.facebook.com/claire.martin")).toThrow(/conversation Messenger/);
    expect(() => conversationUrlFrom("https://evil.com/messages/t/1")).toThrow();
    expect(() => conversationUrlFrom("https://www.facebook.com/messages/e2ee/t/abc")).toThrow();
    expect(() => conversationUrlFrom("pas un lien")).toThrow();
  });

  it("refuse une conversation invalide en nommant la personne", () => {
    expect(() => checkStaff([claire, { name: "Paul Durand", role: "moderator", conversationUrl: "https://www.facebook.com/paul" }])).toThrow(/^staff\[1\]\.conversationUrl : Paul Durand : /);
  });

  it("garde conversation et message, ignore les champs de lecture seule renvoyés par l'agent", () => {
    const parsed = ApiPatch.parse({ staff: [{ ...claire, conversationUrl: "https://www.messenger.com/t/9", contactMessage: " Salut ", contactedAt: "2026-11-05T10:00:00Z", replied: true }] });
    expect(toPatch(parsed, "monvrai.fr").staff).toEqual([{ ...claire, conversationUrl: "https://www.facebook.com/messages/t/9", contactMessage: "Salut" }]);
    // Absent = inchangé (aucune clé) ; vide = effacer (null).
    expect(checkStaff([claire])[0]).not.toHaveProperty("conversationUrl");
    expect(checkStaff([{ ...claire, conversationUrl: "", contactMessage: null }])[0]).toMatchObject({ conversationUrl: null, contactMessage: null });
  });

  it("garde ce qu'on savait d'une personne quand la nouvelle liste ne le redonne pas", () => {
    // Un agent qui renvoie la liste relevée sur Facebook, sans les contacts.
    expect(mergeStaff(known, [{ ...claire, role: "moderator" }], 999)).toEqual([{ ...known[0], role: "moderator" }]);
  });

  it("date le contact quand la conversation apparaît ; un lien corrigé garde la date et oublie l'ancien relevé", () => {
    expect(mergeStaff([claire], [{ ...claire, conversationUrl: conv }], 999)).toEqual([{ ...claire, conversationUrl: conv, contactedAt: 999 }]);
    const other = "https://www.facebook.com/messages/t/2";
    expect(mergeStaff(known, [{ ...claire, conversationUrl: other }], 999)).toEqual([{ ...claire, conversationUrl: other, contactedAt: 100, contactMessage: "Bonjour Claire" }]);
    // Même conversation renvoyée : rien ne bouge.
    expect(mergeStaff(known, [{ ...claire, conversationUrl: conv }], 999)).toEqual(known);
  });

  it("correction du lien (fil chiffré, identifiant provisoire) : la date du contact reste, le relevé part", () => {
    const e2ee = "https://www.facebook.com/messages/e2ee/t/1818328696959987";
    expect(mergeStaff(known, [{ ...claire, conversationUrl: e2ee }], 999)).toEqual([{ ...claire, conversationUrl: e2ee, contactedAt: 100, contactMessage: "Bonjour Claire" }]);
    // Dans n'importe quel sens : e2ee provisoire → e2ee définitif, ou retour à /messages/t/.
    const provisional = [{ ...known[0], conversationUrl: "https://www.facebook.com/messages/e2ee/t/7524330478991061752" }];
    expect(mergeStaff(provisional, [{ ...claire, conversationUrl: e2ee }], 999)[0].contactedAt).toBe(100);
    expect(mergeStaff([{ ...known[0], conversationUrl: e2ee }], [{ ...claire, conversationUrl: conv }], 999)[0].contactedAt).toBe(100);
    // Une conversation notée sans date connue est datée de maintenant.
    expect(mergeStaff([{ ...claire, conversationUrl: conv }], [{ ...claire, conversationUrl: e2ee }], 999)[0].contactedAt).toBe(999);
  });

  it("efface la conversation (et sa date) sur demande, sans laisser de clé vide", () => {
    const [p] = mergeStaff(known, [{ ...claire, conversationUrl: null, contactMessage: null }], 999);
    expect(p).toEqual(claire);
    expect(Object.values(p).some((v) => v === undefined)).toBe(false);
  });

  it("retrouve une personne sans profil par son nom", () => {
    const lea = { name: "Léa Garnier", role: "moderator" as const, profileUrl: null };
    expect(staffKey(lea)).toBe("nom:lea-garnier");
    expect(mergeStaff([{ ...lea, conversationUrl: conv, contactedAt: 5 }], [{ ...lea, name: "Léa  Garnier" }], 999)[0].contactedAt).toBe(5);
  });

  it("un contact noté ne change pas la date de relevé de la liste, une personne de plus si", () => {
    const g = group({ staff: [claire], staffAt: 1 });
    const contacted = applyPatch(g, { staff: [{ ...claire, conversationUrl: conv }] }, 50);
    expect(contacted.staff[0].contactedAt).toBe(50);
    expect(contacted.staffAt).toBe(1);
    const grown = applyPatch(g, { staff: [claire, { name: "Paul", role: "moderator", profileUrl: null }] }, 60);
    expect(grown.staffAt).toBe(60);
    // Liste identique, champs relus dans un autre ordre : pas de réécriture.
    const reordered = { reply, contactMessage: "Bonjour Claire", contactedAt: 100, conversationUrl: conv, profileUrl: claire.profileUrl, role: "admin", name: "Claire" } as FbStaff;
    const same = { ...group({ staffAt: 1 }), staff: [reordered] };
    expect(applyPatch(same, { staff: [{ ...claire }] }, 70).staff).toBe(same.staff);
  });

  it("note un message envoyé : la personne retrouvée par profil, puis par nom, sinon ajoutée", () => {
    const input = (over: object) => ApiStaffContact.parse({ conversationUrl: "https://www.messenger.com/t/77", ...over });
    // Par profil.
    const a = applyStaffContact([claire], input({ profileUrl: "https://m.facebook.com/claire?__tn__=R", message: "Bonjour" }), 10);
    expect(a).toEqual([{ ...claire, conversationUrl: "https://www.facebook.com/messages/t/77", contactedAt: 10, contactMessage: "Bonjour" }]);
    // Par nom, et le profil appris est gardé.
    const paul = { name: "Paul Durand", role: "moderator" as const, profileUrl: null };
    const b = applyStaffContact([claire, paul], input({ name: "paul durand", profileUrl: "https://www.facebook.com/paul.d" }), 11);
    expect(b[1]).toMatchObject({ name: "Paul Durand", role: "moderator", profileUrl: "https://www.facebook.com/paul.d", contactedAt: 11 });
    // Absente : ajoutée, rôle exigé.
    expect(() => applyStaffContact([claire], input({ name: "Inconnue" }), 12)).toThrow(/role obligatoire/);
    expect(applyStaffContact([claire], input({ name: "Inconnue", role: "admin" }), 12)).toHaveLength(2);
    // Même conversation redonnée : la date du premier contact reste.
    expect(applyStaffContact(a, input({ profileUrl: claire.profileUrl }), 99)[0].contactedAt).toBe(10);
    // Ni profil ni nom, ou lien qui n'est pas une conversation.
    expect(() => applyStaffContact([claire], input({}), 12)).toThrow(/profileUrl ou name/);
    expect(() => applyStaffContact([claire], input({ profileUrl: claire.profileUrl, conversationUrl: "https://www.facebook.com/claire" }), 12)).toThrow(/conversation Messenger/);
    expect(ApiStaffContact.safeParse({ conversationUrl: conv, contactedAt: 1 }).success).toBe(false);
  });

  it("enregistre la réponse relevée, et dit qui a répondu", () => {
    const scan = conversationScanFrom({ state: "ok", lastFrom: "me", lastKey: "k", theirs: "2", mine: -1, lastText: "x".repeat(400) }, 8);
    expect(scan).toMatchObject({ state: "ok", theirs: 2, mine: null, lastFrom: "me", lastKey: "k", at: 8 });
    expect(scan.lastText).toHaveLength(200);
    expect(conversationScanFrom({ state: "bizarre", lastFrom: "lui" }, 8)).toMatchObject({ state: "unknown", lastFrom: null, lastKey: null });
    const withConv = [{ ...claire, conversationUrl: conv, contactedAt: 1 }];
    expect(applyStaffReply(withConv, staffKey(claire), scan)[0].reply).toEqual(scan);
    expect(() => applyStaffReply(withConv, "nom:personne", scan)).toThrow(/introuvable/);
    expect(() => applyStaffReply([claire], staffKey(claire), scan)).toThrow(/aucune conversation/);
    // Lu à une autre adresse (fil chiffré, lien introuvable retrouvé) : elle remplace celle
    // notée, quelle qu'en soit la forme, date du contact gardée.
    const e2ee = "https://www.messenger.com/e2ee/t/1818328696959987";
    expect(applyStaffReply(withConv, staffKey(claire), scan, e2ee)[0]).toEqual({ ...withConv[0], conversationUrl: "https://www.facebook.com/messages/e2ee/t/1818328696959987", reply: scan });
    const provisional = [{ ...withConv[0], conversationUrl: "https://www.facebook.com/messages/e2ee/t/7524330478991061752" }];
    expect(applyStaffReply(provisional, staffKey(claire), scan, "https://www.facebook.com/messages/e2ee/t/2512753155917897")[0]).toEqual({ ...withConv[0], conversationUrl: "https://www.facebook.com/messages/e2ee/t/2512753155917897", reply: scan });
    expect(applyStaffReply(withConv, staffKey(claire), scan, "https://www.facebook.com/messages/t/2")[0].conversationUrl).toBe("https://www.facebook.com/messages/t/2");
    // Même adresse, adresse invalide ou absente : rien ne change que le relevé.
    for (const final of [conv, "https://www.facebook.com/claire", "pas une adresse", null, undefined]) {
      expect(applyStaffReply(withConv, staffKey(claire), scan, final)[0]).toEqual({ ...withConv[0], reply: scan });
    }
    // Relevé qui n'a rien lu (introuvable, illisible) : l'adresse notée reste.
    const unread = conversationScanFrom({ state: "unknown", note: "introuvable" }, 8);
    expect(applyStaffReply(withConv, staffKey(claire), unread, e2ee)[0]).toEqual({ ...withConv[0], reply: unread });

    expect(staffReplyState({ reply: undefined })).toBeNull();
    expect(staffReplyState({ reply: { ...scan, lastFrom: "them" } })).toBe("replied");
    expect(staffReplyState({ reply: scan })).toBe("ongoing");
    expect(staffReplyState({ reply: { ...scan, lastKey: null } })).toBe("silent");
    expect(staffReplyState({ reply: { ...scan, state: "unavailable" } })).toBe("missing");
    expect(staffReplyState({ reply: { ...scan, state: "unknown" } })).toBe("unreadable");
    expect(staffReplied({ reply: scan })).toBe(true);
    expect(staffReplied({ reply: { ...scan, lastKey: null } })).toBe(false);
    expect(staffReplied({ reply: { ...scan, state: "unknown" } })).toBeNull();
    // Réponse automatique de Page (notée par le script 1.9.0) : une vraie réponse, signalée.
    const auto = { ...scan, lastFrom: "them" as const, note: "réponse automatique" };
    expect(staffAutoReply({ reply: auto })).toBe(true);
    expect(staffReplied({ reply: auto })).toBe(true);
    expect(staffAutoReply({ reply: scan })).toBe(false);
    expect(staffAutoReply({ reply: { ...auto, lastKey: null } })).toBe(false);
    expect(staffAutoReply({ reply: { ...auto, state: "unknown" } })).toBe(false);
    expect(staffAutoReply({ reply: undefined })).toBe(false);
  });

  it("une personne d'avant le suivi se relit telle quelle", () => {
    expect(group({ staff: [claire] }).staff).toEqual([claire]);
  });
});

describe("état du contact des admins d'un groupe", () => {
  const conv = "https://www.facebook.com/messages/t/1";
  const read = (lastKey: string | null, state: "ok" | "unavailable" | "unknown" = "ok") =>
    conversationScanFrom({ state, lastFrom: "me", lastKey, theirs: 0, mine: 1 }, 1);
  const lea: FbStaff = { name: "Léa", role: "admin", profileUrl: null };
  const tom: FbStaff = { name: "Tom", role: "moderator", profileUrl: null };

  it("none : liste vide, ou personne contactée", () => {
    expect(staffContactState([])).toBe("none");
    expect(staffContactState([lea, tom])).toBe("none");
  });

  it("sent : une conversation notée, aucune réponse relevée", () => {
    expect(staffContactState([{ ...lea, conversationUrl: conv }])).toBe("sent");
    expect(staffContactState([{ ...lea, conversationUrl: conv, reply: read(null) }, tom])).toBe("sent");
  });

  it("replied : un message de la personne relevé, même si l'on a réécrit depuis", () => {
    expect(staffContactState([{ ...lea, conversationUrl: conv, reply: read(null) }, { ...tom, conversationUrl: conv, reply: read("k1") }])).toBe("replied");
  });

  it("un relevé illisible ou une conversation introuvable ne sont pas une réponse", () => {
    expect(staffContactState([{ ...lea, conversationUrl: conv, reply: read("k1", "unknown") }])).toBe("sent");
    expect(staffContactState([{ ...lea, conversationUrl: conv, reply: read("k1", "unavailable") }])).toBe("sent");
  });

  it("les filtres se cumulent, et l'état du contact implique des admins renseignés", () => {
    const empty = group();
    const silent = group({ staff: [lea] });
    const answered = group({ staff: [{ ...lea, conversationUrl: conv, reply: read("k1") }] });
    const pick = (f: Parameters<typeof matchesStaffFilters>[1]) => [empty, silent, answered].filter((g) => matchesStaffFilters(g, f));
    expect(pick({})).toEqual([empty, silent, answered]);
    expect(pick({ staff: "with" })).toEqual([silent, answered]);
    expect(pick({ staff: "without" })).toEqual([empty]);
    expect(pick({ contact: "none" })).toEqual([silent]);
    expect(pick({ contact: "replied" })).toEqual([answered]);
    expect(pick({ staff: "without", contact: "none" })).toEqual([]);
  });
});

describe("adhésion relevée sur la page du groupe", () => {
  it("valide ce que rend le script", () => {
    expect(membershipScanFrom({ state: "join", note: "x", diag: "d" }, 5)).toEqual({ scan: { state: "join", at: 5, note: "x" }, diag: "d" });
    expect(membershipScanFrom({ state: "nimporte" }, 5).scan.state).toBe("unknown");
    expect(membershipScanFrom(null, 5)).toEqual({ scan: { state: "unknown", at: 5, note: null }, diag: null });
    expect(membershipScanFrom({ diag: "a".repeat(5000) }, 5).diag).toHaveLength(3000);
  });

  it("traduit la page en adhésion, sans inventer de refus pour une adhésion jamais demandée", () => {
    expect(membershipFromScan("member", "pending")).toBe("validated");
    expect(membershipFromScan("pending", "none")).toBe("pending");
    expect(membershipFromScan("join", "pending")).toBe("refused");
    expect(membershipFromScan("join", "validated")).toBe("refused");
    expect(membershipFromScan("join", "none")).toBeNull();
    expect(membershipFromScan("unavailable", "pending")).toBeNull();
    expect(membershipFromScan("unknown", "validated")).toBeNull();
  });

  it("une adhésion acceptée change l'adhésion, pas l'onglet, et se date", () => {
    const g = applyMembershipScan(group({ membership: "pending" }), membershipScanFrom({ state: "member" }, 9));
    expect(g).toMatchObject({ membership: "validated", membershipChangedAt: 9, status: "new", membershipScan: { state: "member", at: 9 } });
  });

  it("un refus range le groupe dans « Refusés »", () => {
    expect(applyMembershipScan(group({ membership: "pending" }), membershipScanFrom({ state: "join" }, 9))).toMatchObject({ membership: "refused", status: "refused" });
    expect(applyMembershipScan(group({ membership: "validated", status: "handled" }), membershipScanFrom({ state: "join" }, 9)).status).toBe("refused");
    // Jamais demandée : rien ne change, sauf le relevé.
    const never = applyMembershipScan(group({ membership: "none" }), membershipScanFrom({ state: "join" }, 9));
    expect(never).toMatchObject({ membership: "none", status: "new", membershipChangedAt: null, membershipScan: { state: "join" } });
  });

  it("une adhésion qui revient ressort le groupe des « Refusés », seulement s'il y était", () => {
    expect(applyMembershipScan(group({ membership: "refused", status: "refused" }), membershipScanFrom({ state: "pending" }, 9))).toMatchObject({ membership: "pending", status: "new" });
    expect(applyMembershipScan(group({ membership: "refused", status: "ignored" }), membershipScanFrom({ state: "member" }, 9))).toMatchObject({ membership: "validated", status: "ignored" });
  });

  it("un groupe rangé dans « Refusés » pour un post retiré y reste quand on est toujours membre", () => {
    expect(applyMembershipScan(group({ membership: "validated", status: "refused" }), membershipScanFrom({ state: "member" }, 9))).toMatchObject({ membership: "validated", status: "refused", membershipChangedAt: null });
  });

  it("page introuvable ou illisible : seul le relevé change", () => {
    for (const state of ["unavailable", "unknown"]) {
      const g = applyMembershipScan(group({ membership: "pending" }), membershipScanFrom({ state }, 9));
      expect(g).toMatchObject({ membership: "pending", status: "new", membershipChangedAt: null });
    }
  });

  it("un changement à la main se date aussi, et refusée s'accepte partout sauf à l'ajout", () => {
    expect(applyPatch(group({ membership: "pending" }), { membership: "refused" }, 4).membershipChangedAt).toBe(4);
    expect(applyPatch(group({ membership: "pending" }), { membership: "pending" }, 4).membershipChangedAt).toBeNull();
    expect(ApiPatch.safeParse({ membership: "refused" }).success).toBe(true);
    expect(ApiNewGroup.safeParse({ url: "u", name: "n", membership: "refused" }).success).toBe(false);
  });

  it("un groupe d'avant se relit sans relevé d'adhésion", () => {
    expect(group()).toMatchObject({ membershipScan: null, membershipDiag: null, membershipChangedAt: null });
  });
});

describe("robots et navigateurs", () => {
  it("écarte les robots d'aperçu et les clients sans navigateur", () => {
    expect(isRobot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isRobot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36")).toBe(true);
    expect(isRobot("")).toBe(true);
    expect(isRobot("Google")).toBe(true);
    expect(isRobot(IPHONE_FB)).toBe(false);
    expect(isRobot(ANDROID_CHROME)).toBe(false);
  });
  it("range le navigateur intégré de Facebook à part, et pas sous Safari", () => {
    expect(browserFromUa(IPHONE_FB)).toBe("Facebook (intégré)");
    expect(browserFromUa(ANDROID_CHROME)).toBe("Chrome");
    expect(browserFromUa(MAC_SAFARI)).toBe("Safari");
    expect(osFromUa(IPHONE_FB)).toBe("iOS");
    expect(osFromUa(MAC_SAFARI)).toBe("macOS");
  });
  it("réunit les adresses de Facebook, et compte le site lui-même comme un accès direct", () => {
    expect(refererFamily("https://l.facebook.com/", "monvrai.fr")).toBe("facebook.com");
    expect(refererFamily("https://lm.facebook.com/l.php?u=x", "monvrai.fr")).toBe("facebook.com");
    expect(refererFamily("https://www.monvrai.fr/catalogue", "monvrai.fr")).toBeNull();
    expect(refererFamily("", "monvrai.fr")).toBeNull();
    expect(refererFamily("https://www.qwant.com/", "monvrai.fr")).toBe("qwant.com");
  });
  it("un même visiteur à moins de 30 s est un doublon", () => {
    expect(isDuplicate([1000], 20_000)).toBe(true);
    expect(isDuplicate([1000], 31_001)).toBe(false);
    expect(isDuplicate([], 5)).toBe(false);
  });
});

describe("agrégation", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 10, 4, 12);
  const click = (over: Partial<FbClick>): FbClick =>
    ({ group: "a", at: now, kind: "human", visitor: null, refererHost: "facebook.com", referer: "https://l.facebook.com/", device: "mobile", os: "iOS", browser: "Facebook (intégré)", path: "/", ...over }) as FbClick;

  it("ne compte que les humains par groupe", () => {
    const s = statsByGroup([click({}), click({ at: now - 10 * DAY }), click({ kind: "bot" }), click({ kind: "duplicate" }), click({ group: "b" })], now);
    expect(s.a).toEqual({ clicks: 2, last7: 1, last: now });
    expect(s.b.clicks).toBe(1);
  });

  it("remplit les jours creux et écarte robots et doublons des classements", () => {
    const m = aggregateClicks([click({}), click({ at: now - 2 * DAY, refererHost: null, referer: null }), click({ kind: "bot" }), click({ kind: "duplicate" })], 30, now);
    expect(m.humans).toBe(2);
    expect(m.robots).toBe(1);
    expect(m.duplicates).toBe(1);
    expect(m.byDay).toHaveLength(30);
    expect(m.byDay.reduce((s, d) => s + d.clicks, 0)).toBe(2);
    expect(m.byDay.at(-1)).toEqual({ day: "2026-11-04", clicks: 1 });
    expect(m.byReferer.map((r) => r.key)).toEqual(["(direct)", "facebook.com"]);
    expect(m.byBrowser).toEqual([{ key: "Facebook (intégré)", clicks: 2 }]);
    expect(m.first).toBe(now - 2 * DAY);
    expect(m.last).toBe(now);
  });

  it("compte les groupes ajoutés par l'agent aujourd'hui, à l'heure de Paris", () => {
    const minuitParis = Date.UTC(2026, 10, 3, 23, 30); // 4 novembre, 0 h 30 à Paris
    expect(addedToday([{ createdAt: minuitParis, addedBy: "agent" }, { createdAt: now, addedBy: "admin" }, { createdAt: now - DAY, addedBy: "agent" }], now)).toBe(1);
  });
});

describe("relevé du post", () => {
  const posted = group({ postUrl: "https://www.facebook.com/groups/1/pending_posts/42", postStatus: "pending", status: "handled" });

  it("valide ce que rend le script, sans rien croire tel quel", () => {
    const r = scanFrom({ state: "bizarre", likes: "12", comments: -3, finalUrl: "https://evil.com/x", note: "x".repeat(900) }, 7);
    expect(r.scan).toEqual({ state: "unknown", likes: 12, comments: null, at: 7, note: "x".repeat(500) });
    expect(r.finalUrl).toBeNull();
    expect(scanFrom({ finalUrl: "https://www.facebook.com/groups/1/posts/42/?x=1#coba" }, 1).finalUrl).toBe("https://www.facebook.com/groups/1/posts/42/");
  });

  it("l'état lu sur Facebook fait foi, et l'adresse validée remplace celle de la file d'attente", () => {
    const g = applyScan(posted, scanFrom({ state: "validated", likes: 4, comments: 2, finalUrl: "https://www.facebook.com/groups/1/posts/42" }, 9));
    expect(g.postStatus).toBe("validated");
    expect(g.postUrl).toBe("https://www.facebook.com/groups/1/posts/42");
    expect(applyScan(posted, scanFrom({ state: "unavailable" }, 9)).postStatus).toBe("deleted");
    expect(applyScan(posted, scanFrom({ state: "unknown" }, 9)).postStatus).toBe("pending");
  });

  it("compte les commentaires non lus, et oublie le relevé quand le post change", () => {
    const read = applyScan(posted, scanFrom({ state: "validated", comments: 5 }, 9));
    expect(newComments({ ...read, commentsSeen: 3 })).toBe(2);
    expect(newComments({ scan: null, commentsSeen: 0 })).toBe(0);
    const moved = applyPatch({ ...read, commentsSeen: 5 }, { postUrl: "https://www.facebook.com/groups/1/posts/99" }, 10);
    expect(moved.scan).toBeNull();
    expect(moved.commentsSeen).toBe(0);
    expect(applyPatch(read, { postUrl: read.postUrl }, 10).scan).not.toBeNull();
  });
});

describe("où en est un groupe", () => {
  const stage = (over: Partial<FbGroup> = {}) => groupStage(group(over));

  it("suit la file des gestes, de l'adhésion au post validé", () => {
    expect(stage({ membership: "none" }).key).toBe("join");
    expect(stage({ membership: "pending" }).key).toBe("joining");
    expect(stage({ membership: "validated", message: null }).key).toBe("write");
    expect(stage({ membership: "validated", message: "Bonjour {lien}" }).key).toBe("post");
    const posted = { membership: "validated", message: "Bonjour {lien}", postUrl: "https://www.facebook.com/groups/1/posts/2" } as const;
    expect(stage({ ...posted, postStatus: "pending" }).key).toBe("moderation");
    expect(stage({ ...posted, postStatus: "validated" }).key).toBe("done");
    expect(stage({ ...posted, postStatus: "deleted" }).key).toBe("deleted");
  });

  it("réserve le sable aux étapes qui attendent quelque chose de nous", () => {
    // À nous de jouer : demander, écrire, poster, reposter.
    expect(stage({ membership: "none" }).tone).toBe("warn");
    expect(stage({ membership: "validated", message: null }).tone).toBe("warn");
    expect(stage({ membership: "validated", message: "Bonjour {lien}" }).tone).toBe("warn");
    const posted = { membership: "validated", message: "x {lien}", postUrl: "https://www.facebook.com/groups/1/posts/2" } as const;
    expect(stage({ ...posted, postStatus: "deleted" }).tone).toBe("warn");
    // À eux : l'adhésion et la modération ne dépendent pas de nous, un post validé non plus.
    expect(stage({ membership: "pending" }).tone).toBe("blue");
    expect(stage({ ...posted, postStatus: "pending" }).tone).toBe("blue");
    expect(stage({ ...posted, postStatus: "validated" }).tone).toBe("ok");
  });

  it("un post validé est soldé, et un commentaire non lu le remet au sable", () => {
    const done = group({
      membership: "validated",
      message: "Bonjour {lien}",
      postUrl: "https://www.facebook.com/groups/1/posts/2",
      postStatus: "validated",
      scan: { state: "validated", likes: 3, comments: 4, at: 5, note: null },
    });
    expect(groupStage({ ...done, commentsSeen: 4 })).toMatchObject({ key: "done", tone: "ok" });
    expect(groupStage({ ...done, commentsSeen: 1 })).toMatchObject({ key: "read", label: "3 à lire", tone: "warn" });
  });

  it("une adhésion refusée se dit sur la ligne, même hors de l'onglet « Refusés »", () => {
    expect(stage({ membership: "refused" })).toMatchObject({ key: "refused", label: "Adhésion refusée", tone: "pink" });
  });

  it("ignoré et refusé ne demandent plus rien, quelle que soit l'adhésion", () => {
    expect(stage({ status: "ignored", membership: "none" })).toMatchObject({ key: "ignored", tone: "muted" });
    expect(stage({ status: "refused", membership: "none" })).toMatchObject({ key: "refused", tone: "pink" });
  });
});
