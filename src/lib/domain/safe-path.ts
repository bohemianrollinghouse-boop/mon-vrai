/*
 * Chemin de retour « interne » sûr, pour les redirections après connexion et les liens
 * de suivi (?ref=). Un attaquant ne doit pas pouvoir renvoyer un visiteur hors du site
 * avec une URL monvrai.fr crédible. Vérifier « commence par / et pas par // » ne suffit
 * pas : le parseur URL des navigateurs traite « /\evil.com » comme « //evil.com ».
 * On refuse donc tout antislash, et on confirme que l'URL résolue reste sur l'origine.
 */
export function safeInternalPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\s]/.test(raw)) return fallback;
  try {
    const base = "https://mon-vrai.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
