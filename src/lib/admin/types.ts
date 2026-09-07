/** Résultat commun à toutes les actions serveur de l'admin, consommé par <ActionForm>. */
export type AdminResult =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; error: string; issues?: Record<string, string> };

export const saved = (message = "Enregistré."): AdminResult => ({ ok: true, message });
export const failed = (error: string, issues?: Record<string, string>): AdminResult => ({ ok: false, error, issues });
