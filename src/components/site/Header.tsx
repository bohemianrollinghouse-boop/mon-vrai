import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { loadCartCount } from "@/lib/cart/read";
import { getHeaderMenu } from "@/lib/db/menus";
import { getSettings } from "@/lib/db/settings";
import { resolveTarget } from "@/lib/domain/menu-links";
import { SiteActions, SiteNav } from "./SiteNav";
import { systemPath } from "@/lib/domain/system-pages";

/*
 * En-tête de la maquette : logo, navigation en pastilles, actions. Composant serveur :
 * menu, réglages, panier et session sont lus ici, rien n'est deviné côté client.
 *
 * Le menu mobile est un <details> : repliable sans script, accessible au clavier.
 * L'élément actif est calculé côté client (SiteNav) : la coquille persiste entre les pages.
 */
export async function Header() {
  const [menu, settings, count, user] = await Promise.all([getHeaderMenu(), getSettings(), loadCartCount(), getSessionUser()]);

  const links = menu.items.map((item) => {
    const { href, external, newTab } = resolveTarget(item.target);
    return { id: item.id, label: item.label, href, external, newTab };
  });

  // Connecté : la pastille porte le prénom, comme dans la maquette.
  const firstName = user?.name?.split(" ")[0];
  const actions = [
    { href: systemPath("search"), label: "Rechercher", dark: false },
    { href: systemPath("account"), label: user ? firstName || "Mon compte" : "Compte", dark: false },
    { href: systemPath("cart"), label: count > 0 ? `Panier · ${count}` : "Panier", dark: true },
  ];

  return (
    <header className="sticky top-0 z-30 bg-paper">
      <div className="site-wrap flex items-center justify-between gap-6 py-6 max-[1099px]:py-4">
        <Link href="/" className="shrink-0" aria-label={settings.shopName}>
          <Image src="/logo.svg" alt={settings.shopName} width={120} height={30} className="h-[30px] w-auto" style={{ height: 30, width: "auto" }} priority />
        </Link>

        <SiteNav links={links} />
        <SiteActions actions={actions} />

        <details className="relative min-[1100px]:hidden">
          <summary className="list-none cursor-pointer p-2 [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <span className="block h-0.5 w-[22px] bg-ink before:mb-[5px] before:block before:h-0.5 before:w-[22px] before:-translate-y-[7px] before:bg-ink before:content-[''] after:mt-[5px] after:block after:h-0.5 after:w-[22px] after:bg-ink after:content-['']" />
          </summary>
          <div className="absolute inset-x-0 top-full z-40 mt-3 flex flex-col rounded-card bg-white p-3 shadow-float">
            {[...links, ...actions.map((a) => ({ id: a.href, label: a.label, href: a.href, external: false, newTab: false }))].map((l) => (
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
