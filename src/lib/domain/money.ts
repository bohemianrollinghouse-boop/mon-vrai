/*
 * Les montants sont des entiers en centimes partout dans le code. Ce module est
 * le seul endroit qui convertit vers et depuis l'affichage.
 */

const formatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1000 → « 10,00 € » (espace insécable avant le symbole, comme en typographie française). */
export function formatEuro(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatEuro attend des centimes entiers, reçu ${cents}`);
  }
  return formatter.format(cents / 100);
}

/** 1000 → « 10 € » quand les centimes sont nuls, sinon « 10,50 € ». Pour les titres. */
export function formatEuroShort(cents: number): string {
  if (cents % 100 === 0) {
    return `${cents / 100} €`;
  }
  return formatEuro(cents);
}

/** « 10,00 » ou « 10.5 » ou « 10 » → 1000 / 1050 / 1000. Pour les champs de formulaire. */
export function parseEuroToCents(input: string): number {
  const normalized = input.replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new RangeError(`Montant invalide : « ${input} »`);
  }
  const [whole, frac = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
