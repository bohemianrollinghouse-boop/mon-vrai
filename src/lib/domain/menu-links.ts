import { pagePath, systemPath } from "./system-pages";
import type { MenuTarget } from "./types";

/*
 * Une cible de menu devient une URL ici, et nulle part ailleurs : si un chemin de
 * page système change, le menu suit sans qu'on retouche les données.
 */
export function resolveTarget(target: MenuTarget): { href: string; external: boolean; newTab: boolean } {
  switch (target.kind) {
    case "system":
      return { href: systemPath(target.key), external: false, newTab: false };
    case "page":
      return { href: pagePath(target.slug), external: false, newTab: false };
    case "url": {
      const external = /^https?:\/\//i.test(target.href);
      return { href: target.href, external, newTab: target.newTab };
    }
  }
}

/** Un lien est « courant » si le chemin de la page commence par le sien (sauf l'accueil, exact). */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
