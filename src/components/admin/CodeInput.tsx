"use client";

import { useState } from "react";
import { generateCode } from "@/lib/promos/engine";

/** Champ code en majuscules, avec un bouton « Générer ». */
export function CodeInput({ name, initial, placeholder = "NOEL10", generate = true }: { name: string; initial: string; placeholder?: string; generate?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex gap-2">
      <input name={name} value={value} onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} required minLength={2} maxLength={24} placeholder={placeholder} className="min-w-0 flex-1 rounded-xl bg-paper px-3.5 py-3 text-sm font-extrabold tracking-[0.06em] outline-none placeholder:font-semibold placeholder:tracking-normal placeholder:text-faint focus-visible:outline-2 focus-visible:outline-ink" />
      {generate && (
        <button type="button" onClick={() => setValue(generateCode())} className="whitespace-nowrap rounded-xl bg-paper px-3.5 py-3 text-xs font-bold hover:opacity-70">
          Générer
        </button>
      )}
    </div>
  );
}

/** Bouton « Copier » pour un lien ou un code. */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="whitespace-nowrap rounded-pill bg-surface px-3 py-2 text-[0.6875rem] font-bold hover:opacity-70"
    >
      {done ? "Copié ✓" : "Copier"}
    </button>
  );
}
