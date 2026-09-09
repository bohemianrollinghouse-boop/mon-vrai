"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Navigation de l'admin, groupée en sections (Ventes, Catalogue, Marketing…). Composant
 * client : le layout ne se re-rend pas lors des navigations internes, donc l'élément actif
 * se déduit du chemin côté client (usePathname).
 */

export type NavItem = { href: string; label: string; badge?: number; badgeTone?: "sand" | "pink" | "blue" };
export type NavSection = { label?: string; items: NavItem[] };

const BADGE_TONE = { sand: "bg-tint-sand text-tint-sand-ink", pink: "bg-tint-pink text-tint-pink-ink", blue: "bg-tint-blue text-tint-blue-ink" };

export function AdminNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const item = (n: NavItem) => {
    const active = isActive(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-[14px] px-3.5 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-ink text-white" : "hover:bg-paper"}`}
      >
        <span>{n.label}</span>
        {n.badge ? <span className={`rounded-pill px-2 py-0.5 text-[0.6875rem] font-bold ${active ? "bg-[#333] text-white" : BADGE_TONE[n.badgeTone ?? "sand"]}`}>{n.badge}</span> : null}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5 max-[899px]:flex-row max-[899px]:flex-wrap" aria-label="Administration">
      {sections.map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-0.5 max-[899px]:contents">
          {section.label && <span className="px-3.5 pb-1 pt-3 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-faint max-[899px]:hidden">{section.label}</span>}
          {section.items.map(item)}
        </div>
      ))}
    </nav>
  );
}
