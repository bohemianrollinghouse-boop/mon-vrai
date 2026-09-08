"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent } from "@/lib/domain/menu-links";

/*
 * Navigation principale en pastilles. Composant client : la coquille du site persiste
 * entre les pages, donc l'élément actif doit suivre l'URL côté navigateur (usePathname),
 * pas l'en-tête lu au premier rendu.
 */
export type NavLink = { id: string; label: string; href: string; external: boolean; newTab: boolean };

export function SiteNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="hidden rounded-pill bg-white p-1.5 min-[1100px]:flex">
      {links.map((l) => {
        const current = !l.external && isCurrent(l.href, pathname);
        return (
          <Link
            key={l.id}
            href={l.href}
            target={l.newTab ? "_blank" : undefined}
            rel={l.external ? "noopener" : undefined}
            aria-current={current ? "page" : undefined}
            className={`whitespace-nowrap rounded-pill px-[1.125rem] py-2.5 text-[0.8125rem] font-semibold leading-tight transition-colors ${current ? "bg-ink text-white" : "hover:opacity-70"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Actions de droite (recherche, compte, panier) : le compte est en noir quand on y est. */
export function SiteActions({ actions }: { actions: { href: string; label: string; dark: boolean }[] }) {
  const pathname = usePathname();
  return (
    <div className="hidden gap-2.5 min-[1100px]:flex">
      {actions.map((a) => {
        const current = isCurrent(a.href, pathname);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={current ? "page" : undefined}
            className={`whitespace-nowrap rounded-pill px-[1.125rem] py-3 text-[0.8125rem] font-semibold leading-tight transition-colors ${a.dark || current ? "bg-ink text-white" : "bg-white text-ink"}`}
          >
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
