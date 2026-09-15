/*
 * ISBN : normalisation et clé de contrôle. Un ISBN mal recopié passe inaperçu jusqu'à
 * l'imprimeur ou la base du dépôt légal — la clé finale, elle, se vérifie ici.
 *
 * ISBN-13 : somme pondérée 1,3,1,3… des douze premiers chiffres ; la clé complète à un
 * multiple de 10. ISBN-10 : pondération 10…2, modulo 11, clé « X » pour 10.
 */

/** Retire tirets, espaces et points ; met la clé « x » en majuscule. */
export function normalizeIsbn(input: string): string {
  return input.replace(/[\s.-]/g, "").toUpperCase();
}

/** Clé de contrôle d'un ISBN-13, à partir de ses douze premiers chiffres. */
export function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidIsbn(input: string): boolean {
  const s = normalizeIsbn(input);
  if (/^\d{13}$/.test(s)) return isbn13CheckDigit(s.slice(0, 12)) === Number(s[12]);
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
    sum += s[9] === "X" ? 10 : Number(s[9]);
    return sum % 11 === 0;
  }
  return false;
}

/*
 * Affichage groupé d'un ISBN-13 français : préfixe, zone linguistique, éditeur, titre,
 * clé. Le découpage éditeur/titre dépend en toute rigueur de la plage attribuée par
 * l'AFNIL ; on ne coupe donc QUE ce qui est certain (978 / 2) et on laisse le reste
 * d'un bloc, plutôt que d'inventer une coupure fausse. Tout autre ISBN sort tel quel.
 */
export function formatIsbn(input: string): string {
  const s = normalizeIsbn(input);
  if (!/^97[89]\d{10}$/.test(s)) return s;
  return `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4, 12)}-${s.slice(12)}`;
}
