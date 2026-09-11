import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { loadCartCount } from "@/lib/cart/read";
import { getHeaderMenu } from "@/lib/db/menus";
import { getSettings } from "@/lib/db/settings";
import { resolveTarget } from "@/lib/domain/menu-links";
import { SiteActions, SiteNav, type SiteAction } from "./SiteNav";
import { CartIcon } from "./ActionIcons";
import { MobileMenu } from "./MobileMenu";
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

  /*
   * Trois icônes, sans libellé visible (maquette 11a). L'intitulé du compte suit l'état
   * de la session : il n'est plus affiché, mais il est annoncé aux lecteurs d'écran et
   * sert d'infobulle.
   */
  const actions: SiteAction[] = [
    { href: systemPath("search"), label: "Rechercher", icon: "search" },
    { href: systemPath("account"), label: user ? user.name || "Mon compte" : "Se connecter", icon: "account" },
    { href: systemPath("cart"), label: "Panier", icon: "cart", count },
  ];

  return (
    <header className="sticky top-0 z-30 bg-paper">
      <div className="site-wrap relative flex items-center justify-between gap-6 py-6 max-[1099px]:py-4">
        <Link href="/" className="shrink-0" aria-label={settings.shopName}>
          <Image src="/email-logo.png" alt={settings.shopName} width={120} height={30} className="h-[30px] w-auto" style={{ height: 30, width: "auto" }} priority />
        </Link>

        <SiteNav links={links} />
        <SiteActions actions={actions} />

        {/* Mobile : le panier reste visible à côté du burger ; le reste va dans le menu. */}
        <div className="flex items-center gap-2 min-[1100px]:hidden">
          {/* Même icône que sur bureau : un libellé d'un côté et une icône de l'autre
              se lirait comme deux interfaces différentes. */}
          <Link
            href={systemPath("cart")}
            aria-label={count > 0 ? `Panier · ${count}` : "Panier"}
            title="Panier"
            className="relative flex h-[42px] w-[42px] items-center justify-center rounded-pill bg-white text-ink"
          >
            <CartIcon />
            {count > 0 && (
              <span aria-hidden="true" className="absolute -top-1 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-ink px-1.5 text-[0.625rem] font-extrabold text-white">
                {count}
              </span>
            )}
          </Link>

          <MobileMenu
            shopName={settings.shopName}
            items={[...links, ...actions.filter((a) => a.href !== systemPath("cart")).map((a) => ({ id: a.href, label: a.label, href: a.href, external: false, newTab: false }))]}
          />
        </div>
      </div>
    </header>
  );
}
