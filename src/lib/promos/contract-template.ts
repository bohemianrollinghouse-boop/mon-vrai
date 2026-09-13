import { AUTOMATIC_PLACEHOLDERS, LEGACY_NAMES } from "./contract-variables";

/*
 * Variables d'un contrat.
 *
 * Un contrat s'écrit une fois et vaut pour tous : ce qui change d'un signataire à
 * l'autre — son identité, ses comptes, les livres reçus, leur valeur — s'écrit
 * `{{CREATEUR_PRENOM}}` dans le texte et se remplit à l'affichage.
 *
 * Deux familles :
 *  - les AUTOMATIQUES, déduites du signataire, du kit et des réglages. L'administration
 *    n'a pas à les saisir, et ne le doit pas : elles doivent refléter la réalité du jour ;
 *  - les autres, propres à la campagne (délais, plateformes, droits publicitaires…),
 *    remplies dans la fiche du contrat. L'éditeur les détecte dans le texte et propose
 *    un champ pour chacune, ce qui évite d'en tenir une liste à jour ici.
 *
 * Une variable sans valeur n'est jamais laissée en `{{…}}` sous les yeux du signataire.
 * Ce qui lui arrive dépend de sa place dans le texte :
 *
 *  - SEULE sur sa ligne, sous un intitulé (« Plateformes prévues : »), elle emporte la
 *    ligne ET son intitulé. Un contrat ne doit pas annoncer une rubrique pour ne rien en
 *    dire ;
 *  - AU MILIEU d'une phrase (« dans un délai de {{X}} jours »), on ne peut pas supprimer
 *    la phrase sans perdre la clause : elle devient « non défini », qui se lit et
 *    s'assume ;
 *  - déclarée OBLIGATOIRE dans la fiche du contrat, elle devient « non défini » où
 *    qu'elle soit — une rubrique qu'on veut voir figurer, même vide.
 */

const AUTO = new Set<string>(AUTOMATIC_PLACEHOLDERS);

/* Un ancien nom anglais reste compris : il désigne la même valeur que son équivalent
   français, le temps que les contrats rédigés avant la traduction soient repris. */
const canonical = (key: string) => LEGACY_NAMES[key] ?? key;

/** Les variables présentes dans un texte, sans doublon et dans l'ordre d'apparition. */
export function placeholdersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}

/** Celles que l'administration doit remplir : tout ce qui n'est pas automatique. */
export function manualPlaceholders(text: string): string[] {
  return placeholdersIn(text).filter((k) => !AUTO.has(canonical(k)));
}

const PLACEHOLDER = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
const UNSET = "non défini";

const valueOf = (values: Record<string, string>, key: string) => values[key] ?? values[canonical(key)] ?? "";
const filled = (values: Record<string, string>, key: string) => Boolean(valueOf(values, key).trim());

/*
 * Une ligne qui ne porte QUE des variables et, au plus, un court intitulé suivi de deux
 * points : « Autre : {{X}} », « {{X}} ». C'est ce qui autorise à la supprimer en entier.
 */
function onlyLabelAndVars(line: string): boolean {
  /* Retirer la variable laisse des espaces en trop : on les ramène à un seul. */
  const rest = line.replace(PLACEHOLDER, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  /* La ponctuation de fin ne compte pas : « raison sociale : {{X}}, » reste une rubrique. */
  return /^[,;]?$/.test(rest) || /^[^.!?]{1,60}:\s*[,;]?$/.test(rest);
}

/** Remplace chaque variable dans une ligne ; les vides deviennent « non défini ». */
const substitute = (line: string, values: Record<string, string>) =>
  line.replace(PLACEHOLDER, (_, key: string) => (filled(values, key) ? valueOf(values, key) : UNSET));

export function renderContract(text: string, values: Record<string, string>, required: Iterable<string> = []): string {
  const req = new Set(required);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const keys = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
    if (keys.length === 0) {
      out.push(line);
      continue;
    }
    const allEmpty = keys.every((k) => !filled(values, k));
    const anyRequired = keys.some((k) => req.has(k) || req.has(canonical(k)));

    if (allEmpty && !anyRequired && onlyLabelAndVars(line)) {
      /* La rubrique disparaît. Son intitulé, s'il est sur la ligne au-dessus, part avec
         elle : « Date indicative : » sans date ne dit rien. */
      const previous = out[out.length - 1]?.trim() ?? "";
      if (previous.endsWith(":") && !PLACEHOLDER.test(previous)) out.pop();
      continue;
    }
    out.push(substitute(line, values));
  }

  /* Les suppressions laissent des trous : deux lignes vides de suite n'en font qu'une. */
  return out
    .filter((line, i) => line.trim() !== "" || (out[i - 1] ?? "").trim() !== "")
    .join("\n")
    .trim();
}

/**
 * Remplacement simple, sans suppression de rubrique : sert au résumé, où chaque ligne
 * vaut pour elle-même.
 */
export function fillContract(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_, key: string) => (filled(values, key) ? valueOf(values, key) : UNSET));
}
