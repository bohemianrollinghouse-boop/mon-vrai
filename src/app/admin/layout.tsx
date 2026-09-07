import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

/*
 * Layout de l'administration. requireAdmin() redirige tout visiteur sans rôle admin :
 * c'est la vraie barrière — proxy.ts ne fait qu'un premier tri sur la présence du
 * cookie. Navigation latérale sobre, contenu à droite.
 */

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/commandes", label: "Commandes" },
  { href: "/admin/produits", label: "Produits" },
  { href: "/admin/pages", label: "Pages" },
  { href: "/admin/contenus", label: "Contenus" },
  { href: "/admin/menus", label: "Menus" },
  { href: "/admin/politiques", label: "Pages légales" },
  { href: "/admin/medias", label: "Médias" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/reglages", label: "Réglages" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();
  const pathname = (await headers()).get("x-pathname") ?? "/admin";

  return (
    <div className="site-wrap grid min-h-[70vh] grid-cols-[220px_1fr] gap-8 py-8 max-[899px]:grid-cols-1">
      <aside className="flex flex-col gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-subtle">Administration</span>
          <span className="truncate text-sm font-semibold">{user.email}</span>
        </div>
        <nav className="flex flex-col gap-0.5 max-[899px]:flex-row max-[899px]:flex-wrap" aria-label="Administration">
          {NAV.map((n) => {
            const current = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={current ? "page" : undefined}
                className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold ${current ? "bg-ink text-white" : "hover:bg-white"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 border-t border-line-warm pt-4 text-sm">
          <Link href="/" className="font-semibold hover:underline">
            ← Voir le site
          </Link>
          <form action={signOut}>
            <button type="submit" className="font-semibold text-subtle hover:underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
