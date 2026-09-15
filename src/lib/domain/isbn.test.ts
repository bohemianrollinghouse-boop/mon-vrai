import { describe, expect, it } from "vitest";
import { formatIsbn, isValidIsbn, isbn13CheckDigit, normalizeIsbn } from "./isbn";

describe("normalizeIsbn", () => {
  it("retire la ponctuation de saisie", () => {
    expect(normalizeIsbn("978-2-9876543-1-0")).toBe("9782987654310");
    expect(normalizeIsbn(" 0-4394 2089 x ")).toBe("043942089X");
  });
});

describe("isbn13CheckDigit", () => {
  it("retrouve la clé d'un ISBN connu", () => {
    expect(isbn13CheckDigit("978030640615")).toBe(7);
  });
});

describe("isValidIsbn", () => {
  it("accepte un ISBN-13 juste", () => {
    expect(isValidIsbn("9783161484100")).toBe(true);
    expect(isValidIsbn("978-0-306-40615-7")).toBe(true);
  });

  it("refuse un ISBN-13 dont la clé ne suit pas", () => {
    expect(isValidIsbn("9783161484101")).toBe(false);
  });

  it("accepte un ISBN-10, clé X comprise", () => {
    expect(isValidIsbn("0306406152")).toBe(true);
    expect(isValidIsbn("043942089X")).toBe(true);
  });

  it("refuse ce qui n'a pas la bonne longueur", () => {
    expect(isValidIsbn("12345")).toBe(false);
    expect(isValidIsbn("")).toBe(false);
  });
});

describe("formatIsbn", () => {
  it("groupe un ISBN-13 sans inventer la coupure éditeur/titre", () => {
    expect(formatIsbn("9782987654310")).toBe("978-2-98765431-0");
  });

  it("laisse intact ce qui n'est pas un ISBN-13", () => {
    expect(formatIsbn("0306406152")).toBe("0306406152");
  });
});
