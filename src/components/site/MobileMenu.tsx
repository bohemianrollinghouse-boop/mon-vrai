"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * Menu mobile : bouton burger + panneau plein écran qui glisse depuis la droite. Le
 * panneau reste monté (hors écran quand fermé) pour que la translation s'anime. Fermé au
 * clic sur un lien, sur la croix, ou avec Échap ; le défilement de la page est bloqué
 * pendant l'ouverture.
 */

type Item = { id: string; label: string; href: string; external?: boolean; newTab?: boolean };

export function MobileMenu({ items, shopName }: { items: Item[]; shopName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open} className="p-2">
        <span className="block h-0.5 w-[22px] bg-ink before:mb-[5px] before:block before:h-0.5 before:w-[22px] before:-translate-y-[7px] before:bg-ink before:content-[''] after:mt-[5px] after:block after:h-0.5 after:w-[22px] after:bg-ink after:content-['']" />
      </button>

      <div
        role="dialog"
        aria-modal={open}
        aria-label="Menu"
        aria-hidden={!open}
        className={`fixed inset-0 z-50 flex flex-col bg-paper transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-6 py-6">
          <span className="text-lg font-extrabold tracking-[-0.01em]">{shopName}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer le menu" className="flex h-11 w-11 items-center justify-center rounded-pill bg-white text-2xl leading-none">
            ×
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-4 pt-4" aria-label="Navigation mobile">
          {items.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              target={l.newTab ? "_blank" : undefined}
              rel={l.external ? "noopener" : undefined}
              onClick={() => setOpen(false)}
              className="rounded-pill px-5 py-4 text-xl font-bold hover:bg-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
