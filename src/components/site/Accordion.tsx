"use client";

import { useState, type ReactNode } from "react";

/** Accordéon de la fiche produit : un seul volet ouvert à la fois, + / − à droite. */
export function Accordion({ items, defaultOpen = 0 }: { items: { title: string; body: ReactNode }[]; defaultOpen?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col border-t border-line-warm">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.title} className="flex flex-col border-b border-line-warm">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)} className="flex items-center justify-between gap-4 py-[1.125rem] text-left text-[0.9375rem] font-bold">
              <span>{it.title}</span>
              <span className="text-lg text-subtle" aria-hidden="true">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && <div className="pb-[1.125rem] text-sm leading-relaxed text-[#555] [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">{it.body}</div>}
          </div>
        );
      })}
    </div>
  );
}
