import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { loadCartCount } from "@/lib/cart/read";
import { getHeaderMenu } from "@/lib/db/menus";
import { getSettings } from "@/lib/db/settings";
import { isCurrent, resolveTarget } from "@/lib/domain/menu-links";
import { systemPath } from "@/lib/domain/system-pages";

/*
 * En-tête de la maquette : logo, navigation en pastilles, actions. Composant serveur :
 * menu, réglages, panier et session sont lus ici, rien n'est deviné côté client.
 *
 * Le menu mobile est un <details> : repliable sans script, accessible au clavier.
 * Le chemin courant vient de l'en-tête `x-pathname` posé par proxy.ts.
 */
export async function Header() {
  const [menu, settings, count, user, pathname] = await Promise.all([
    getHeaderMenu(),
    getSettings(),
    loadCartCount(),
    getSessionUser(),
    headers().then((h) => h.get("x-pathname") ?? "/"),
  ]);

  const links = menu.items.map((item) => {
    const { href, external, newTab } = resolveTarget(item.target);
    return { id: item.id, label: item.label, href, external, newTab, current: !external && isCurrent(href, pathname) };
  });

  const actions = [
    { href: systemPath("search"), label: "Rechercher", dark: false },
    { href: systemPath("account"), label: user ? "Mon compte" : "Compte", dark: false },
    { href: systemPath("cart"), label: count > 0 ? `Panier · ${count}` : "Panier", dark: true },
  ];

  return (
    <header className="sticky top-0 z-30 bg-paper">
      <div className="site-wrap flex items-center justify-between gap-6 py-6 max-[1099px]:py-4">
        <Link href="/" className="shrink-0" aria-label={settings.shopName}>
          <Image src="/logo.svg" alt={settings.shopName} width={120} height={30} className="h-[30px] w-auto" style={{ height: 30, width: "auto" }} priority />
        </Link>

        <nav aria-label="Navigation principale" className="hidden rounded-pill bg-white p-1.5 min-[1100px]:flex">
          {links.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              target={l.newTab ? "_blank" : undefined}
              rel={l.external ? "noopener" : undefined}
              aria-current={l.current ? "page" : undefined}
              className={`whitespace-nowrap rounded-pill px-[1.125rem] py-2.5 text-[0.8125rem] font-semibold leading-tight ${
                l.current ? "bg-ink text-white" : "hover:opacity-70"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden gap-2.5 min-[1100px]:flex">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`whitespace-nowrap rounded-pill px-[1.125rem] py-3 text-[0.8125rem] font-semibold leading-tight ${
                a.dark ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              {a.label}
            </Link>
          ))}
        </div>

        <details className="relative min-[1100px]:hidden">
          <summary className="list-none cursor-pointer p-2 [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <span className="block h-0.5 w-[22px] bg-ink before:mb-[5px] before:block before:h-0.5 before:w-[22px] before:-translate-y-[7px] before:bg-ink before:content-[''] after:mt-[5px] after:block after:h-0.5 after:w-[22px] after:bg-ink after:content-['']" />
          </summary>
          <div className="absolute inset-x-0 top-full z-40 mt-3 flex flex-col rounded-card bg-white p-3 shadow-float">
            {[...links, ...actions.map((a) => ({ id: a.href, label: a.label, href: a.href, external: false, newTab: false, current: false }))].map((l) => (
              <Link key={l.id} href={l.href} className="rounded-pill px-4 py-3 text-[0.9375rem] font-semibold hover:bg-paper">
                {l.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}
