import "server-only";
import { cookies } from "next/headers";

/*
 * Thème de l'administration : clair, sombre, ou celui du système d'exploitation. Le choix
 * vit dans un cookie, donc il est connu dès le rendu serveur — la page arrive déjà dans la
 * bonne couleur, sans clignotement. Le site public n'est jamais concerné : les couleurs ne
 * changent que sous la coquille `.admin-shell` (voir globals.css).
 */

export const ADMIN_THEME_COOKIE = "mv_admin_theme";
export const ADMIN_THEMES = ["clair", "sombre", "auto"] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];

/** Par défaut « auto » : l'admin suit le réglage clair/sombre de l'ordinateur. */
export async function readAdminTheme(): Promise<AdminTheme> {
  const value = (await cookies()).get(ADMIN_THEME_COOKIE)?.value;
  return ADMIN_THEMES.includes(value as AdminTheme) ? (value as AdminTheme) : "auto";
}

/** Valeur de l'attribut `data-theme` que le CSS interroge. */
export function themeAttribute(theme: AdminTheme): "light" | "dark" | "auto" {
  return theme === "clair" ? "light" : theme === "sombre" ? "dark" : "auto";
}
