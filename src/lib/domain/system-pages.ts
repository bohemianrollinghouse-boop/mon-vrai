import type { SystemPageKey } from "./types";

/*
 * Chemins connus du site. « catalogue » et « contact » sont désormais des pages
 * libres, mais leur adresse reste fixe : l'interface y renvoie en dur (panier vide,
 * page 404, fil d'Ariane d'un livre). Renommer ces deux pages casserait ces liens —
 * c'est pourquoi PINNED_SLUGS l'interdit.
 *
 * Pages système : celles que le site fournit lui-même, par opposition aux pages
 * créées dans l'admin. Un menu peut cibler l'une ou l'autre ; ce registre est la
 * seule liste à mettre à jour si une page système apparaît.
 *
 * « Notre histoire » et les pages légales n'y sont plus : ce sont des pages libres,
 * composées en blocs, servies par /pages/<slug>. L'accueil reste système — c'est la
 * racine du site —, mais son contenu peut venir d'une page (voir db/pages.getHomePage).
 */
export const SYSTEM_PAGES: Record<SystemPageKey, { path: string; label: string }> = {
  home: { path: "/", label: "Accueil" },
  catalogue: { path: "/catalogue", label: "Catalogue" },
  search: { path: "/recherche", label: "Recherche" },
  cart: { path: "/panier", label: "Panier" },
  account: { path: "/compte", label: "Compte" },
  contact: { path: "/contact", label: "Contact" },
};

export function systemPath(key: SystemPageKey): string {
  return SYSTEM_PAGES[key].path;
}

/*
 * Une page libre vit à son adresse, directement sous la racine : /notre-histoire.
 * C'est la route attrape-tout `(site)/[...slug]` qui la sert.
 */
export function pagePath(slug: string): string {
  return `/${slug}`;
}

/*
 * Premiers segments que le site se réserve : routes statiques, admin, API et fichiers
 * servis à la racine. Une page ne peut pas s'y installer — la route statique gagnerait
 * et la page serait injoignable. Vérifié à l'enregistrement, pas seulement à l'affichage.
 */
export const RESERVED_PATHS = new Set([
  "admin",
  "api",
  "commande",
  "compte",
  "livres",
  "panier",
  "recherche",
  "newsletter",
  "_next",
  "favicon.ico",
  "icon.png",
  "apple-icon.png",
  "sitemap.xml",
  "robots.txt",
]);

/*
 * Adresses que l'interface du site référence en dur : elles ne peuvent pas être
 * renommées depuis l'admin sans casser des liens ailleurs.
 */
export const PINNED_SLUGS = new Set(["catalogue", "contact"]);

/** Vrai si cette adresse entre en conflit avec une route du site. */
export function isReservedPath(slug: string): boolean {
  return RESERVED_PATHS.has(slug.split("/")[0] ?? "");
}

export function productPath(slug: string): string {
  return `/livres/${slug}`;
}
