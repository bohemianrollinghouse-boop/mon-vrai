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
  staffFromText,
  staffToText,
  toPatch,
  checkMessage,
  fillMessage,
  FbGroup,
  groupRoot,
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
  it("lit la saisie de l'écran, une personne par ligne, et la réécrit à l'identique", () => {
    const staff = staffFromText("Claire Martin | https://www.facebook.com/claire.martin\n\nmodératrice | Paul\nJeanne | facebook.com/profile.php?id=42 | modo");
    expect(staff).toEqual([
      { name: "Claire Martin", role: "admin", profileUrl: "https://www.facebook.com/claire.martin" },
      { name: "Paul", role: "moderator", profileUrl: null },
      { name: "Jeanne", role: "moderator", profileUrl: "https://www.facebook.com/profile.php?id=42" },
    ]);
    expect(staffFromText(staffToText(staff))).toEqual(staff);
    expect(staffFromText("")).toEqual([]);
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

  it("ignoré et refusé ne demandent plus rien, quelle que soit l'adhésion", () => {
    expect(stage({ status: "ignored", membership: "none" })).toMatchObject({ key: "ignored", tone: "muted" });
    expect(stage({ status: "refused", membership: "none" })).toMatchObject({ key: "refused", tone: "pink" });
  });
});
