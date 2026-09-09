import Image from "next/image";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/session";
import { adminSnapshot } from "@/lib/admin/counts";
import { AdminNav, type NavSection } from "@/components/admin/AdminNav";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { PwaRegister } from "@/components/admin/PwaRegister";
import { Avatar } from "@/components/admin/ui";
import { ModeToggle } from "@/components/admin/ModeToggle";

/*
 * PWA « admin seule » : le manifest est scopé à /admin (installable uniquement depuis
 * l'admin, jamais depuis la boutique). Voir /admin/manifest.webmanifest et /admin/sw.js.
 */
export const metadata: Metadata = {
  title: { default: "Mon Vrai Admin", template: "%s · Mon Vrai Admin" },
  manifest: "/admin/manifest",
  appleWebApp: { capable: true, title: "Mon Vrai Admin", statusBarStyle: "default" },
  icons: { apple: "/admin/app-icon/180" },
};

export const viewport: Viewport = { themeColor: "#111111" };

/*
 * Coquille de l'administration, d'après la maquette « Mon Vrai - Admin » : une barre
 * latérale blanche de 240 px, collante, avec la navigation et ses badges (commandes à
 * expédier, titres en stock bas, messages non lus) ; le contenu à droite sur fond
 * crème. Aucun élément du site public ici. requireAdmin() est la vraie barrière ;
 * proxy.ts ne fait qu'un premier tri sur la présence du cookie. L'élément actif est
 * calculé côté client (AdminNav) : le layout persiste entre les navigations.
 */

export const dynamic = "force-dynamic";

/** Date du dernier build (donc du dernier déploiement), en heure de Paris. */
function formatBuildTime(iso: string | undefined): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date inconnue";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  const snap = await adminSnapshot();

  const sections: NavSection[] = [
    {
      items: [{ href: "/admin", label: "Tableau de bord" }],
    },
    {
      label: "Ventes",
      items: [
        { href: "/admin/commandes", label: "Commandes", badge: snap.toShip, badgeTone: "sand" },
        { href: "/admin/clients", label: "Clients" },
        { href: "/admin/messages", label: "Messages", badge: snap.unread, badgeTone: "blue" },
      ],
    },
    {
      label: "Catalogue",
      items: [
        { href: "/admin/produits", label: "Produits" },
        { href: "/admin/stocks", label: "Stocks", badge: snap.lowStock.length, badgeTone: "pink" },
      ],
    },
    {
      label: "Marketing",
      items: [
        { href: "/admin/newsletter", label: "Newsletter" },
        { href: "/admin/codes-promo", label: "Codes promo" },
        { href: "/admin/influenceurs", label: "Influenceurs" },
        { href: "/admin/statistiques", label: "Statistiques" },
      ],
    },
    {
      label: "Contenu du site",
      items: [
        { href: "/admin/contenus", label: "Contenus" },
        { href: "/admin/pages", label: "Pages" },
        { href: "/admin/menus", label: "Menus" },
        { href: "/admin/medias", label: "Médias" },
        { href: "/admin/faq", label: "FAQ" },
        { href: "/admin/politiques", label: "Pages légales" },
      ],
    },
    {
      label: "Réglages",
      items: [
        { href: "/admin/reglages", label: "Paramètres" },
        { href: "/admin/emails", label: "E-mails" },
      ],
    },
  ];

  const displayName = user.name || user.email.split("@")[0];

  return (
    <div className="grid min-h-screen flex-1 grid-cols-[240px_minmax(0,1fr)] max-[899px]:grid-cols-1">
      <PwaRegister />
      <AdminSidebar>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-2">
            <Link href="/admin" aria-label="Tableau de bord">
              <Image src="/email-logo.png" alt="Mon Vrai" width={96} height={24} className="h-6 w-auto" style={{ height: 24, width: "auto" }} priority />
            </Link>
            <span className="rounded-pill bg-tint-sand px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-sand-ink">Admin</span>
          </div>
          <ModeToggle stripe={snap.settings.payments.mode} boxtal={snap.settings.shipping.boxtalMode} />
        </div>
        <AdminNav sections={sections} />
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
          <p className="px-2 text-[0.625rem] text-faint" title={process.env.BUILD_COMMIT ? `commit ${process.env.BUILD_COMMIT}` : undefined}>
            Code mis à jour le {formatBuildTime(process.env.BUILD_TIME)}
          </p>
        </div>
      </AdminSidebar>

      <main className="flex min-w-0 flex-col gap-6 px-10 pb-16 pt-8 max-[899px]:px-5 max-[899px]:pt-20">
        {(snap.settings.payments.mode === "test" || snap.settings.shipping.boxtalMode === "test") && (
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-tint-sand px-5 py-3 text-[0.8125rem] font-semibold text-tint-sand-ink">
            <span>
              Mode test :{" "}
              <strong>
                {snap.settings.payments.mode === "test" && snap.settings.shipping.boxtalMode === "test"
                  ? "Stripe et Boxtal"
                  : snap.settings.payments.mode === "test"
                    ? "Stripe"
                    : "Boxtal"}
              </strong>{" "}
              en bac à sable (aucun débit ni étiquette réels). Réglage par service dans Paramètres, bascule globale en haut à gauche.
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
