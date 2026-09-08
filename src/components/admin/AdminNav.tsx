"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Navigation de l'admin. Composant client : le layout ne se re-rend pas lors des
 * navigations internes, donc l'élément actif doit se déduire du chemin côté client
 * (usePathname), pas d'un en-tête lu au premier rendu.
 */

export type NavItem = { href: string; label: string; badge?: number; badgeTone?: "sand" | "pink" | "blue" };

const BADGE_TONE = { sand: "bg-tint-sand text-tint-sand-ink", pink: "bg-tint-pink text-tint-pink-ink", blue: "bg-tint-blue text-tint-blue-ink" };

export function AdminNav({ primary, secondary }: { primary: NavItem[]; secondary: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const item = (n: NavItem) => {
    const active = isActive(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-[14px] px-3.5 py-3 text-sm font-semibold transition-colors ${active ? "bg-ink text-white" : "hover:bg-paper"}`}
      >
        <span>{n.label}</span>
        {n.badge ? <span className={`rounded-pill px-2 py-0.5 text-[0.6875rem] font-bold ${active ? "bg-[#333] text-white" : BADGE_TONE[n.badgeTone ?? "sand"]}`}>{n.badge}</span> : null}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5 max-[899px]:flex-row max-[899px]:flex-wrap" aria-label="Administration">
      {primary.map(item)}
      <span className="my-2 border-t border-line-soft max-[899px]:hidden" aria-hidden="true" />
      {secondary.map(item)}
    </nav>
  );
}
