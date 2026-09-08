"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Autocomplétion d'adresse par la Base Adresse Nationale (api-adresse.data.gouv.fr) :
 * gratuite, sans clé, couverture France. On propose des suggestions dès trois lettres,
 * et un choix remplit d'un coup la rue, le code postal et la ville. Hors France, le
 * champ reste une simple saisie (l'API ne couvre que la France).
 */

type Picked = { line1: string; postalCode: string; city: string };
type Suggestion = { id: string; label: string; line1: string; postalCode: string; city: string };
type BanFeature = { properties?: { id?: string; label?: string; name?: string; postcode?: string; city?: string } };

export function AddressAutocomplete({
  value,
  country,
  onInput,
  onPick,
  fieldClassName,
  labelClassName,
}: {
  value: string;
  country: string;
  onInput: (v: string) => void;
  onPick: (a: Picked) => void;
  fieldClassName: string;
  labelClassName: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const skipNext = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Recherche débouncée : on annule la requête précédente si l'utilisateur continue à taper.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (country !== "FR" || value.trim().length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(value)}&limit=5&autocomplete=1`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { features?: BanFeature[] };
        const list: Suggestion[] = (data.features ?? [])
          .map((f, i) => ({
            id: f.properties?.id ?? String(i),
            label: f.properties?.label ?? "",
            line1: f.properties?.name ?? f.properties?.label ?? "",
            postalCode: f.properties?.postcode ?? "",
            city: f.properties?.city ?? "",
          }))
          .filter((s) => s.line1);
        setSuggestions(list);
        setActive(-1);
        setOpen(list.length > 0);
      } catch {
        // Requête annulée ou réseau indisponible : on laisse la saisie manuelle.
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, country]);

  // Fermer la liste quand on clique en dehors.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: Suggestion) {
    skipNext.current = true; // la valeur va changer : ne pas relancer une recherche.
    onPick({ line1: s.line1, postalCode: s.postalCode, city: s.city });
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <label className={labelClassName}>
        <span>Adresse</span>
        <input
          required
          autoComplete="off"
          value={value}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="adresse-suggestions"
          className={fieldClassName}
        />
      </label>
      {open && suggestions.length > 0 && (
        <ul id="adresse-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-line bg-white py-1 shadow-float">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-[1.125rem] py-2.5 text-left text-sm font-semibold ${i === active ? "bg-paper" : "hover:bg-paper"}`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
