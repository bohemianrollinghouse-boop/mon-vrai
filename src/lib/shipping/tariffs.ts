/*
 * Barème de livraison : tranches de poids et coût réel payé chez Boxtal (le fournisseur),
 * par transporteur actif et par pays de destination (FR, BE, LU). Ces coûts servent de
 * repère dans l'admin (« ce que tu paies vraiment ») ; le prix facturé au client, lui,
 * est saisi dans les réglages (settings.shipping.rates[].prices) et peut être différent.
 *
 * Coûts issus de la grille officielle Boxtal 2026-01-15, exprimés TTC (grille HT × 1,20,
 * TVA 20 % que Mon Vrai ne récupère pas). Le Luxembourg n'a pas de barème propre chez
 * Boxtal : il est facturé en zone Europe, au même tarif que la Belgique.
 *
 * Un imagier pèse ~100 g ; l'emballage ~60 g. Neuf livres tiennent donc largement sous
 * 1 kg — mais on garde des tranches jusqu'à 3 kg par sécurité. Chaque tranche = poids
 * MAXIMUM : un colis de 700 g relève de la tranche « 1 kg ».
 */

export const SHIPPING_COUNTRIES = ["FR", "BE", "LU"] as const;
export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

export const COUNTRY_LABELS: Record<ShippingCountry, string> = {
  FR: "France",
  BE: "Belgique",
  LU: "Luxembourg",
};

/** Tranches de poids, en grammes (poids maximum de la tranche). */
export const WEIGHT_BRACKETS = [
  { maxG: 250, label: "Jusqu'à 250 g" },
  { maxG: 500, label: "Jusqu'à 500 g" },
  { maxG: 1000, label: "Jusqu'à 1 kg" },
  { maxG: 2000, label: "Jusqu'à 2 kg" },
  { maxG: 3000, label: "Jusqu'à 3 kg" },
] as const;

export const BRACKET_COUNT = WEIGHT_BRACKETS.length;

/** Indice de la tranche pour un poids donné ; au-delà de la dernière, on prend la dernière. */
export function bracketIndexForWeight(weightG: number): number {
  const i = WEIGHT_BRACKETS.findIndex((b) => weightG <= b.maxG);
  return i === -1 ? BRACKET_COUNT - 1 : i;
}

type Matrix = Record<ShippingCountry, number[]>;

/*
 * Coût réel Boxtal (centimes, TTC), parallèle à WEIGHT_BRACKETS, par transporteur actif.
 * La clé est l'id du tarif dans settings.shipping.rates.
 */
export const SUPPLIER_COST_TTC: Record<string, Matrix> = {
  "mondial-relay": {
    FR: [365, 377, 421, 588, 625],
    BE: [426, 426, 520, 842, 887],
    LU: [426, 426, 520, 842, 887],
  },
  colissimo: {
    FR: [800, 901, 1092, 1224, 1342],
    BE: [1021, 1033, 1266, 1356, 1458],
    LU: [1021, 1033, 1266, 1356, 1458],
  },
  chronopost: {
    FR: [1532, 1532, 1532, 1532, 1548],
    BE: [1463, 1463, 1463, 1603, 1744],
    LU: [1463, 1463, 1463, 1603, 1744],
  },
};

/** Coût fournisseur pour un tarif / pays / tranche, ou undefined si hors barème. */
export function supplierCost(rateId: string, country: string, bracketIndex: number): number | undefined {
  const m = SUPPLIER_COST_TTC[rateId];
  if (!m) return undefined;
  const row = m[(country as ShippingCountry)] ?? m.FR;
  return row?.[bracketIndex];
}
