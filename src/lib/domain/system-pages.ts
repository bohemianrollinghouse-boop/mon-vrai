import type { SystemPageKey } from "./types";

/*
 * Pages système : celles que le site fournit lui-même, par opposition aux pages
 * créées dans l'admin. Un menu peut cibler l'une ou l'autre ; ce registre est la
 * seule liste à mettre à jour si une page système apparaît.
 */
export const SYSTEM_PAGES: Record<SystemPageKey, { path: string; label: string }> = {
  home: { path: "/", label: "Accueil" },
  catalogue: { path: "/catalogue", label: "Catalogue" },
  search: { path: "/recherche", label: "Recherche" },
  cart: { path: "/panier", label: "Panier" },
  account: { path: "/compte", label: "Compte" },
  contact: { path: "/contact", label: "Contact" },
  policies: { path: "/informations", label: "Informations" },
  story: { path: "/notre-histoire", label: "Notre histoire" },
};

export function systemPath(key: SystemPageKey): string {
  return SYSTEM_PAGES[key].path;
}

export function pagePath(slug: string): string {
  return `/pages/${slug}`;
}

export function policyPath(handle: string): string {
  return `/informations/${handle}`;
}

export function productPath(slug: string): string {
  return `/livres/${slug}`;
}
