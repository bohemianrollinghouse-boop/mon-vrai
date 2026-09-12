/*
 * Variables d'un contrat.
 *
 * Un contrat s'écrit une fois et vaut pour tous : ce qui change d'un signataire à
 * l'autre — son identité, ses comptes, les livres reçus, leur valeur — s'écrit
 * `{{CREATOR_FIRST_NAME}}` dans le texte et se remplit à l'affichage.
 *
 * Deux familles :
 *  - les AUTOMATIQUES, déduites du signataire, du kit et des réglages. L'administration
 *    n'a pas à les saisir, et ne le doit pas : elles doivent refléter la réalité du jour ;
 *  - les autres, propres à la campagne (délais, plateformes, droits publicitaires…),
 *    remplies dans la fiche du contrat. L'éditeur les détecte dans le texte et propose
 *    un champ pour chacune, ce qui évite d'en tenir une liste à jour ici.
 *
 * Une variable sans valeur n'est jamais laissée en `{{…}}` sous les yeux du signataire :
 * elle devient un tiret. Un contrat troué se voit ; un contrat avec des accolades fait
 * douter de tout le reste.
 */

export const AUTOMATIC_PLACEHOLDERS = [
  "MONVRAI_ADDRESS",
  "MONVRAI_SIREN",
  "MONVRAI_REPRESENTATIVE",
  "CREATOR_FIRST_NAME",
  "CREATOR_LAST_NAME",
  "CREATOR_ADDRESS",
  "CREATOR_EMAIL",
  "CREATOR_TAX_COUNTRY",
  "CREATOR_STATUS",
  "CREATOR_COMPANY_DETAILS",
  "INSTAGRAM_ACCOUNT",
  "TIKTOK_ACCOUNT",
  "OTHER_SOCIAL_ACCOUNT",
  "PRODUCTS_LIST",
  "PRODUCTS_QUANTITY",
  "PRODUCTS_TOTAL_VALUE",
  "CONTRACT_ACCEPTED_AT",
  "CONTRACT_VERSION",
  "CONTRACT_ID",
] as const;

const AUTO = new Set<string>(AUTOMATIC_PLACEHOLDERS);

/** Les variables présentes dans un texte, sans doublon et dans l'ordre d'apparition. */
export function placeholdersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}

/** Celles que l'administration doit remplir : tout ce qui n'est pas automatique. */
export function manualPlaceholders(text: string): string[] {
  return placeholdersIn(text).filter((k) => !AUTO.has(k));
}

/** Remplace chaque variable ; celles qui manquent deviennent un tiret, jamais `{{…}}`. */
export function fillContract(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key];
    return value && value.trim() ? value : "—";
  });
}
