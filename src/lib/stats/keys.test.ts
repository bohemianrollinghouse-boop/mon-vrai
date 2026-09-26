import { describe, expect, it } from "vitest";
import { bucketPath, clientIp, dayKey, deviceKind, hourKey, ipKey, isBot, isExcludedIp, isIpAddress, lastDays, OTHER_PAGE, pickUserAgent, referrerHost, sourceKey, sourceMeta, visitorHash } from "./keys";

describe("clés de temps (Europe/Paris)", () => {
  it("bascule de jour à minuit heure de Paris, pas UTC", () => {
    // 2026-07-01 22:30 UTC = 00:30 le 2 juillet à Paris (UTC+2).
    const ts = Date.UTC(2026, 6, 1, 22, 30);
    expect(dayKey(ts)).toBe("2026-07-02");
    expect(hourKey(ts)).toBe("00");
  });

  it("liste les n derniers jours du plus ancien au plus récent", () => {
    const now = Date.UTC(2026, 8, 9, 12);
    expect(lastDays(now, 3)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });
});

describe("bucketPath", () => {
  it("garde les pages connues, sans paramètres ni slash final", () => {
    expect(bucketPath("/")).toBe("/");
    expect(bucketPath("/catalogue/?tri=prix")).toBe("/catalogue");
    expect(bucketPath("/livres/le-visage#haut")).toBe("/livres/le-visage");
    expect(bucketPath("/informations/cgv")).toBe("/informations/cgv");
    expect(bucketPath("/recherche?q=chat")).toBe("/recherche");
  });

  it("regroupe le détail de commande et rejette l'inconnu", () => {
    expect(bucketPath("/compte/commandes/ord_abc123")).toBe("/compte/commandes");
    expect(bucketPath("/wp-admin.php")).toBe(OTHER_PAGE);
    expect(bucketPath("/livres/Le Visage")).toBe(OTHER_PAGE);
    expect(bucketPath("livres")).toBe(OTHER_PAGE);
    expect(bucketPath("/" + "a".repeat(200))).toBe(OTHER_PAGE);
  });
});

describe("referrerHost", () => {
  it("renvoie l'hôte sans www, ou (direct)", () => {
    expect(referrerHost("https://www.instagram.com/p/xyz", "monvrai.fr")).toBe("instagram.com");
    expect(referrerHost("https://monvrai.fr/catalogue", "monvrai.fr")).toBe("(direct)");
    expect(referrerHost("https://www.monvrai.fr/", "monvrai.fr")).toBe("(direct)");
    expect(referrerHost("", "monvrai.fr")).toBe("(direct)");
    expect(referrerHost("pas une url", "monvrai.fr")).toBe("(direct)");
  });
});

describe("isBot / visitorHash / pickUserAgent", () => {
  it("reconnaît les robots courants et les agents vides", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe(false);
  });

  it("change d'empreinte avec le jour et l'identifiant, sans le révéler", () => {
    const a = visitorHash("sel", "2026-09-09", "abc123");
    expect(a).not.toBe(visitorHash("sel", "2026-09-10", "abc123"));
    expect(a).not.toBe(visitorHash("sel", "2026-09-09", "abc124"));
    expect(a).toHaveLength(16);
    expect(a).not.toContain("abc");
  });

  it("ignore l'en-tête « Google » posé par le proxy et prend le navigateur de la balise", () => {
    const real = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    expect(pickUserAgent("Google", real)).toBe(real);
    expect(pickUserAgent(real, "autre")).toBe(real);
    expect(pickUserAgent(null, "")).toBe("");
  });
});

describe("deviceKind / sourceKey / sourceMeta", () => {
  it("classe les appareils", () => {
    expect(deviceKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe("mobile");
    expect(deviceKind("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe("tablette");
    expect(deviceKind("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe("tablette");
    expect(deviceKind("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe("mobile");
    expect(deviceKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15")).toBe("ordinateur");
  });

  it("préfère utm_source au référent", () => {
    expect(sourceKey("Newsletter", "https://mail.google.com/", "monvrai.fr")).toBe("utm:newsletter");
    expect(sourceKey("", "https://www.instagram.com/x", "monvrai.fr")).toBe("instagram.com");
    expect(sourceKey(null, null, "monvrai.fr")).toBe("(direct)");
  });

  it("habille les sources connues", () => {
    expect(sourceMeta("instagram.com").name).toBe("Instagram");
    expect(sourceMeta("l.instagram.com").ini).toBe("IG");
    expect(sourceMeta("google.fr").name).toBe("Google");
    expect(sourceMeta("utm:newsletter").name).toBe("Newsletter");
    expect(sourceMeta("(direct)").name).toBe("Accès direct");
    expect(sourceMeta("blog-parents.fr")).toEqual({ name: "blog-parents.fr", ini: "BL", tone: "sand" });
  });
});

describe("visites qu'on ne compte pas", () => {
  it("lit l'adresse du visiteur derrière le proxy, la première de la chaîne", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "88.120.4.17, 35.191.0.1" }))).toBe("88.120.4.17");
    expect(clientIp(new Headers({ "x-real-ip": "88.120.4.17" }))).toBe("88.120.4.17");
    expect(clientIp(new Headers())).toBe("");
  });

  it("ramène une IPv6 à son /64 : la fin de l'adresse change toute seule", () => {
    expect(ipKey("2a01:cb00:1234:5600:1c2d:3e4f:5a6b:7c8d")).toBe("2a01:cb00:1234:5600");
    expect(isExcludedIp("2a01:cb00:1234:5600:9999:8888:7777:6666", ["2a01:cb00:1234:5600:1c2d:3e4f:5a6b:7c8d"])).toBe(true);
    expect(isExcludedIp("2a01:cb00:1234:5601:1c2d:3e4f:5a6b:7c8d", ["2a01:cb00:1234:5600:1c2d:3e4f:5a6b:7c8d"])).toBe(false);
  });

  it("déplie « :: » et ramène une IPv4 encapsulée à son IPv4", () => {
    expect(ipKey("2a01:cb00::1")).toBe("2a01:cb00:0:0");
    expect(ipKey("::ffff:88.120.4.17")).toBe("88.120.4.17");
    expect(ipKey("[2a01:cb00:1234:5600::1]")).toBe("2a01:cb00:1234:5600");
    expect(ipKey("88.120.4.17:54321")).toBe("88.120.4.17");
  });

  it("compare une IPv4 en entier, et ne s'exclut pas sans adresse", () => {
    expect(isExcludedIp("88.120.4.17", ["88.120.4.17"])).toBe(true);
    expect(isExcludedIp("88.120.4.18", ["88.120.4.17"])).toBe(false);
    expect(isExcludedIp("", ["88.120.4.17"])).toBe(false);
    expect(isExcludedIp("88.120.4.17", [])).toBe(false);
  });

  it("refuse à la saisie ce qui n'est pas une adresse", () => {
    expect(isIpAddress("88.120.4.17")).toBe(true);
    expect(isIpAddress("2a01:cb00:1234:5600::1")).toBe(true);
    expect(isIpAddress("::ffff:88.120.4.17")).toBe(true);
    expect(isIpAddress("999.1.1.1")).toBe(false);
    expect(isIpAddress("mon adresse")).toBe(false);
    expect(isIpAddress("88.120.4")).toBe(false);
  });
});
