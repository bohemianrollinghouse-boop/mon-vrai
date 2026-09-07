import { describe, expect, it } from "vitest";
import { formatEuro, formatEuroShort, parseEuroToCents } from "./money";

// Intl insère une espace insécable (U+00A0) entre le nombre et le symbole.
const NBSP = " ";

describe("formatEuro", () => {
  it("affiche des centimes en euros à la française", () => {
    expect(formatEuro(1000)).toBe(`10,00${NBSP}€`);
    expect(formatEuro(1050)).toBe(`10,50${NBSP}€`);
    expect(formatEuro(0)).toBe(`0,00${NBSP}€`);
  });

  it("refuse un montant non entier : un flottant sur de l'argent est un bug", () => {
    expect(() => formatEuro(10.5)).toThrow(TypeError);
  });
});

describe("formatEuroShort", () => {
  it("omet les centimes quand ils sont nuls", () => {
    expect(formatEuroShort(1000)).toBe(`10${NBSP}€`);
    expect(formatEuroShort(8000)).toBe(`80${NBSP}€`);
  });

  it("les garde sinon", () => {
    expect(formatEuroShort(1050)).toBe(`10,50${NBSP}€`);
  });
});

describe("parseEuroToCents", () => {
  it("accepte les saisies usuelles d'un formulaire", () => {
    expect(parseEuroToCents("10")).toBe(1000);
    expect(parseEuroToCents("10,00")).toBe(1000);
    expect(parseEuroToCents("10.5")).toBe(1050);
    expect(parseEuroToCents(" 10,50 € ")).toBe(1050);
  });

  it("refuse plus de deux décimales et les valeurs non numériques", () => {
    expect(() => parseEuroToCents("10,005")).toThrow(RangeError);
    expect(() => parseEuroToCents("dix")).toThrow(RangeError);
    expect(() => parseEuroToCents("")).toThrow(RangeError);
  });
});
