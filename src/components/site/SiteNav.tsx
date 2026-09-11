"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountIcon, CartIcon, SearchIcon } from "./ActionIcons";
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
/*
 * Actions de l'en-tête, en icônes (maquette 11a) : une pastille ronde de 42 px par
 * action. Elle passe en sombre sur la page correspondante, comme une entrée de menu
 * active — et le compteur du panier passe alors au vert pour rester lisible dessus.
 *
 * L'icône seule ne dit rien à un lecteur d'écran : chaque lien porte son intitulé en
 * `aria-label`, et le compteur est annoncé avec.
 */
export type SiteAction = { href: string; label: string; icon: "search" | "account" | "cart"; count?: number };

const ICONS = { search: SearchIcon, account: AccountIcon, cart: CartIcon };

export function SiteActions({ actions }: { actions: SiteAction[] }) {
  const pathname = usePathname();
  return (
    <div className="hidden gap-2 min-[1100px]:flex">
      {actions.map((a) => {
        const current = isCurrent(a.href, pathname);
        const Icon = ICONS[a.icon];
        const badge = a.count && a.count > 0 ? a.count : null;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={current ? "page" : undefined}
            aria-label={badge ? `${a.label} · ${badge}` : a.label}
            title={a.label}
            className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-pill transition-colors ${current ? "bg-ink text-white" : "bg-white text-ink hover:opacity-70"}`}
          >
            <Icon />
            {badge && (
              <span
                aria-hidden="true"
                className={`absolute -top-1 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill px-1.5 text-[0.625rem] font-extrabold ${current ? "bg-tint-green text-ink" : "bg-ink text-white"}`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

