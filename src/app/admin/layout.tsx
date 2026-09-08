import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/session";
import { adminSnapshot } from "@/lib/admin/counts";
import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { Avatar } from "@/components/admin/ui";

/*
 * Coquille de l'administration, d'après la maquette « Mon Vrai - Admin » : une barre
 * latérale blanche de 240 px, collante, avec la navigation et ses badges (commandes à
 * expédier, titres en stock bas, messages non lus) ; le contenu à droite sur fond
 * crème. Aucun élément du site public ici. requireAdmin() est la vraie barrière ;
 * proxy.ts ne fait qu'un premier tri sur la présence du cookie. L'élément actif est
 * calculé côté client (AdminNav) : le layout persiste entre les navigations.
 */

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  const snap = await adminSnapshot();

  const primary: NavItem[] = [
    { href: "/admin", label: "Tableau de bord" },
    { href: "/admin/commandes", label: "Commandes", badge: snap.toShip, badgeTone: "sand" },
    { href: "/admin/produits", label: "Produits" },
    { href: "/admin/stocks", label: "Stocks", badge: snap.lowStock.length, badgeTone: "pink" },
    { href: "/admin/faq", label: "FAQ" },
    { href: "/admin/reglages", label: "Paramètres" },
  ];
  const secondary: NavItem[] = [
    { href: "/admin/contenus", label: "Contenus" },
    { href: "/admin/pages", label: "Pages" },
    { href: "/admin/menus", label: "Menus" },
    { href: "/admin/politiques", label: "Pages légales" },
    { href: "/admin/medias", label: "Médias" },
    { href: "/admin/clients", label: "Clients" },
    { href: "/admin/messages", label: "Messages", badge: snap.unread, badgeTone: "blue" },
  ];

  const displayName = user.name || user.email.split("@")[0];

  return (
    <div className="grid min-h-screen flex-1 grid-cols-[240px_minmax(0,1fr)] max-[899px]:grid-cols-1">
      <aside className="sticky top-0 flex h-screen flex-col gap-6 border-r border-line-sand bg-white px-4 py-6 max-[899px]:static max-[899px]:h-auto max-[899px]:border-b max-[899px]:border-r-0">
        <div className="flex items-center justify-between px-2">
          <Link href="/admin" aria-label="Tableau de bord">
            <Image src="/logo.svg" alt="Mon Vrai" width={96} height={24} className="h-6 w-auto" style={{ height: 24, width: "auto" }} priority />
          </Link>
          <span className="rounded-pill bg-tint-sand px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-sand-ink">Admin</span>
        </div>
        <AdminNav primary={primary} secondary={secondary} />
        <div className="mt-auto flex flex-col gap-3 max-[899px]:mt-0">
          <Link href="/" target="_blank" className="flex justify-between rounded-[14px] bg-paper px-3.5 py-3 text-[0.8125rem] font-semibold hover:opacity-70">
            <span>Voir la boutique</span>
            <span aria-hidden="true">↗</span>
          </Link>
          <div className="flex items-center gap-2.5 px-2">
            <Avatar name={displayName} className="h-8 w-8 bg-tint-green text-tint-green-ink" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[0.8125rem] font-bold">{displayName}</span>
              <form action={signOut}>
                <button type="submit" className="text-[0.6875rem] text-subtle hover:underline">
                  Propriétaire · se déconnecter
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col gap-6 px-10 pb-16 pt-8 max-[899px]:px-5">
        {snap.settings.payments.mode === "test" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tint-sand px-5 py-3 text-[0.8125rem] font-semibold text-tint-sand-ink">
            <span>
              Paiements en <strong>mode test</strong> : cartes réelles refusées, commandes marquées « Test », pas de facture.
            </span>
            <Link href="/admin/reglages#paiements" className="underline">
              Changer
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
