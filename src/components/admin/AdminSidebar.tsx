"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

/*
 * Coquille de la barre latérale admin. En desktop (≥ 900 px) : barre collante de 240 px,
 * comme avant. En mobile : une barre supérieure avec un menu burger qui ouvre la barre en
 * tiroir (glissé depuis la gauche), avec voile, fermeture à l'échap / au clic / à la
 * navigation. Le contenu (logo, ModeToggle, navigation, pied) est passé en enfants —
 * rendu une seule fois côté serveur, utilisé pour les deux dispositions.
 */
export function AdminSidebar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Barre mobile avec burger (masquée en desktop). Fixe : le contenu principal a un padding haut en mobile. */}
      <div className="fixed inset-x-0 top-0 z-40 hidden items-center justify-between border-b border-line-sand bg-white px-4 py-2.5 max-[899px]:flex">
        <Link href="/admin" aria-label="Tableau de bord" className="flex items-center gap-2">
          <Image src="/email-logo.png" alt="Mon Vrai" width={96} height={24} className="h-6 w-auto" style={{ height: 24, width: "auto" }} priority />
          <span className="rounded-pill bg-tint-sand px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-sand-ink">Admin</span>
        </Link>
        <button type="button" aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-paper hover:opacity-70">
          <span className="flex flex-col gap-[5px]">
            <span className="block h-0.5 w-5 rounded bg-ink" />
            <span className="block h-0.5 w-5 rounded bg-ink" />
            <span className="block h-0.5 w-5 rounded bg-ink" />
          </span>
        </button>
      </div>

      {/* Voile (mobile, tiroir ouvert) */}
      {open && <button type="button" aria-label="Fermer le menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 hidden bg-black/40 max-[899px]:block" />}

      {/* Barre latérale : collante en desktop, tiroir en mobile. */}
      <aside
        onClick={(e) => {
          // Fermer le tiroir dès qu'on clique un lien (navigation).
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={`sticky top-0 z-50 flex h-screen flex-col gap-6 overflow-y-auto border-r border-line-sand bg-white px-4 py-6 max-[899px]:fixed max-[899px]:left-0 max-[899px]:top-0 max-[899px]:w-[84%] max-[899px]:max-w-[320px] max-[899px]:shadow-2xl max-[899px]:transition-transform max-[899px]:duration-200 ${open ? "max-[899px]:translate-x-0" : "max-[899px]:-translate-x-full"}`}
      >
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-pill bg-paper text-lg leading-none max-[899px]:flex">
          ×
        </button>
        {children}
      </aside>
    </>
  );
}
