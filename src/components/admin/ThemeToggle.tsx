import { setAdminThemeAction } from "@/lib/admin/actions/theme";
import type { AdminTheme } from "@/lib/admin/theme";

/*
 * Choix du thème de l'administration, dans le pied de la barre latérale. Trois formulaires
 * côte à côte plutôt qu'un bouton à bascule : chaque option est atteignable en un clic, et
 * tout fonctionne sans JavaScript. « Auto » suit le réglage de l'ordinateur.
 */

const OPTIONS: { value: AdminTheme; label: string; title: string }[] = [
  { value: "clair", label: "Clair", title: "Toujours en clair" },
  { value: "sombre", label: "Sombre", title: "Toujours en sombre" },
  { value: "auto", label: "Auto", title: "Suivre le réglage de l'ordinateur" },
];

export function ThemeToggle({ current }: { current: AdminTheme }) {
  return (
    <div className="flex items-center gap-1 rounded-pill bg-paper p-1" role="group" aria-label="Thème de l'administration">
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return active ? (
          <span key={o.value} aria-current="true" className="flex-1 rounded-pill bg-ink px-2 py-1.5 text-center text-[0.6875rem] font-bold text-on-ink">
            {o.label}
          </span>
        ) : (
          <form key={o.value} action={setAdminThemeAction} className="flex-1">
            <input type="hidden" name="theme" value={o.value} />
            <button type="submit" title={o.title} className="w-full rounded-pill px-2 py-1.5 text-[0.6875rem] font-bold text-subtle transition-colors hover:text-ink">
              {o.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}
