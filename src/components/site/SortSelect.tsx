"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/*
 * Sélecteur de tri en pilule. Le tri vit dans l'URL (?tri=…) : partageable, et rendu
 * côté serveur - le composant client ne fait que naviguer.
 */
export function SortSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="relative flex min-w-0 max-w-full items-center">
      <span className="sr-only-keep">Trier</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "position") next.delete("tri");
          else next.set("tri", e.target.value);
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
        }}
        className="min-w-0 max-w-full cursor-pointer appearance-none truncate rounded-pill bg-white py-2.5 pr-8 pl-4 text-[0.8125rem] font-semibold"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            Trier · {o.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-3.5 text-xs">
        ▾
      </span>
    </label>
  );
}
