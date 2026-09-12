import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/*
 * Primitives du back-office, calquées sur la maquette « Mon Vrai - Admin » : fond
 * crème, cartes blanches très arrondies (24 px), champs sur fond crème sans bordure,
 * pilules noires pour l'action principale. Aucune logique ici : les formulaires sont
 * de vrais <form> vers des actions serveur.
 */

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && (
          <Link href={back.href} className="w-fit text-xs font-semibold text-subtle hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[1.875rem] font-extrabold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="text-[0.8125rem] font-semibold text-subtle">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  aside,
  children,
  className = "",
  tone = "white",
  collapsible = false,
  defaultOpen = false,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "white" | "dark" | "green" | "sand" | "pink" | "blue";
  /** Carte repliable, fermée par défaut : pour les réglages qu'on ne touche pas à chaque passage. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const bg = {
    white: "bg-surface",
    dark: "bg-deep text-on-deep",
    green: "bg-tint-green text-tint-green-ink",
    sand: "bg-tint-sand text-tint-sand-ink",
    pink: "bg-tint-pink text-tint-pink-ink",
    blue: "bg-tint-blue text-tint-blue-ink",
  }[tone];

  /*
   * <details> plutôt qu'un état React : rien à hydrater, le clavier et les lecteurs
   * d'écran fonctionnent d'eux-mêmes, et le contenu reste dans le DOM une fois replié
   * — un formulaire qu'on referme sans enregistrer garde donc sa saisie.
   */
  if (collapsible) {
    return (
      <details open={defaultOpen} className={`group flex flex-col rounded-card p-6 ${bg} ${className}`}>
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-baseline gap-2">
            {title && <h2 className="text-base font-extrabold">{title}</h2>}
            <span aria-hidden="true" className="text-xs text-subtle transition-transform group-open:rotate-90">
              ▶
            </span>
          </span>
          {aside}
        </summary>
        <div className="flex flex-col gap-3.5 pt-3.5">{children}</div>
      </details>
    );
  }

  return (
    <section className={`flex flex-col gap-3.5 rounded-card p-6 ${bg} ${className}`}>
      {(title || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-extrabold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const input =
  "w-full rounded-[14px] border-0 bg-paper px-4 py-3.5 text-sm font-semibold text-ink outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:text-subtle";

export { Field } from "./Field";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${input} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${input} min-h-[6rem] resize-y leading-relaxed ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${input} cursor-pointer ${props.className ?? ""}`} />;
}

/** Champ de recherche en pilule blanche (GET), comme dans la maquette. */
export function SearchBox({ action, name = "q", defaultValue = "", placeholder, hidden = {} }: { action: string; name?: string; defaultValue?: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} method="get" role="search" className="flex">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-w-[220px] rounded-pill bg-surface px-[1.125rem] py-3 text-[0.8125rem] font-semibold outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
    </form>
  );
}

/** Interrupteur oui/non : une case à cocher stylée, donc soumise comme telle (« on » ou absente). */
export function Switch({ label, hint, className = "", ...props }: ComponentProps<"input"> & { label: ReactNode; hint?: string }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 text-[0.8125rem] font-semibold ${className}`}>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint && <span className="text-xs font-medium text-subtle">{hint}</span>}
      </span>
      <input type="checkbox" {...props} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-pill bg-switch-off transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-knob-off after:transition-transform peer-checked:after:bg-knob-on peer-checked:after:translate-x-4"
      />
    </label>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
      <input type="checkbox" {...props} className="h-4 w-4 accent-ink" />
      {label}
    </label>
  );
}

/** Deux ou trois choix exclusifs dans une pilule crème (radios stylées). */
export function Segmented({ name, options, defaultValue, className = "" }: { name: string; options: { value: string; label: string }[]; defaultValue: string; className?: string }) {
  return (
    <div className={`flex gap-1.5 rounded-pill bg-paper p-1.5 text-xs font-bold ${className}`}>
      {options.map((o) => (
        <label key={o.value} className="flex-1 cursor-pointer">
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="peer sr-only" />
          <span className="block rounded-pill px-3 py-2.5 text-center transition-colors peer-checked:bg-ink peer-checked:text-on-ink peer-focus-visible:outline-2 peer-focus-visible:outline-ink">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

type Tone = "primary" | "secondary" | "danger" | "ghost" | "outline";
const TONE: Record<Tone, string> = {
  primary: "bg-ink text-on-ink hover:opacity-80",
  secondary: "bg-surface text-ink hover:opacity-70",
  danger: "bg-danger-bg text-danger hover:opacity-80",
  ghost: "text-ink underline-offset-4 hover:underline",
  outline: "border-[1.5px] border-current bg-transparent hover:opacity-70",
};

export function Button({ tone = "primary", className = "", type = "submit", ...props }: ComponentProps<"button"> & { tone?: Tone }) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-pill px-[1.125rem] py-3 text-[0.8125rem] font-bold transition-opacity disabled:opacity-50 ${TONE[tone]} ${className}`}
    />
  );
}

export function ButtonLink({ tone = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { tone?: Tone }) {
  return <Link {...props} className={`inline-flex items-center justify-center whitespace-nowrap rounded-pill px-[1.125rem] py-3 text-[0.8125rem] font-bold transition-opacity ${TONE[tone]} ${className}`} />;
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: ReactNode }) {
  const cls = tone === "ok" ? "bg-tint-green text-tint-green-ink" : tone === "error" ? "bg-danger-bg text-danger" : "bg-tint-blue text-tint-blue-ink";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-[14px] px-4 py-3 text-sm font-semibold ${cls}`}>
      {children}
    </p>
  );
}

/** Pilules de filtre (liens GET) avec compteur optionnel, la sélection en noir. */
export function FilterPills({ items }: { items: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Filtrer">
      {items.map((f) => (
        <Link key={f.href} href={f.href} aria-current={f.active ? "page" : undefined} className={`rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${f.active ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
          {f.label}
          {f.count !== undefined && <span className="ml-1.5 opacity-60">{f.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Tableau en grille, comme la maquette : en-tête en capitales grises, lignes séparées
 * par un filet doux, la ligne entière cliquable si `href` est donné.
 */
/*
 * Tableau en grille. L'en-tête et CHAQUE ligne sont des grilles distinctes — il le faut
 * pour qu'une ligne entière soit un lien cliquable —, si bien qu'une colonne `auto` se
 * dimensionne sur le contenu de sa propre grille : l'en-tête se décale alors des
 * cellules. Les colonnes doivent donc être des largeurs définies (`px`, `fr`,
 * `minmax(Npx, …)`), jamais `auto` seul.
 */
export function GridTable({ columns, head, rows, empty = "Rien pour l'instant." }: { columns: string; head: ReactNode[]; rows: { key: string; href?: string; cells: ReactNode[] }[]; empty?: string }) {
  const grid = { gridTemplateColumns: columns };
  return (
    <div className="overflow-x-auto rounded-card bg-surface px-6 py-2">
      <div className="min-w-[720px]">
        <div className="grid items-center gap-3.5 py-3.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint" style={grid}>
          {head.map((h, i) => (
            <span key={i} className={i === head.length - 1 ? "text-right" : ""}>
              {h}
            </span>
          ))}
        </div>
        {rows.length === 0 && <p className="py-6 text-sm text-muted">{empty}</p>}
        {rows.map((r) => {
          const cls = "grid items-center gap-3.5 border-t border-line-soft py-3.5 text-[0.8125rem]";
          const cells = r.cells.map((c, i) => (
            <div key={i} className={`min-w-0 [&>span.truncate]:block ${i === r.cells.length - 1 ? "text-right" : ""}`}>
              {c}
            </div>
          ));
          return r.href ? (
            <Link key={r.key} href={r.href} className={`${cls} hover:opacity-70`} style={grid}>
              {cells}
            </Link>
          ) : (
            <div key={r.key} className={cls} style={grid}>
              {cells}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compatibilité : ancien tableau HTML, restylé. Préférer GridTable pour les nouveaux écrans. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card bg-surface px-6 py-2">
      <table className="w-full text-[0.8125rem]">
        <thead>
          <tr className="text-left text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">
            {head.map((h) => (
              <th key={h} className="px-2 py-3.5 font-bold first:pl-0 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line-soft [&>tr>td]:px-2 [&>tr>td]:py-3.5 [&>tr>td:first-child]:pl-0 [&>tr>td:last-child]:pr-0">{children}</tbody>
      </table>
    </div>
  );
}

export type PillTone = "neutral" | "ok" | "warn" | "muted" | "blue" | "pink";
export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: PillTone }) {
  const cls = {
    neutral: "bg-paper text-ink",
    ok: "bg-tint-green text-tint-green-ink",
    warn: "bg-tint-sand text-tint-sand-ink",
    muted: "bg-line-soft text-subtle",
    blue: "bg-tint-blue text-tint-blue-ink",
    pink: "bg-tint-pink text-tint-pink-ink",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-pill px-2.5 py-[5px] text-[0.6875rem] font-bold ${cls}`}>{children}</span>;
}

/** Tuile chiffre du tableau de bord : teinte, libellé, valeur, précision. */
export function Tile({ label, value, note, tone = "white", href }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: "white" | "green" | "pink" | "sand" | "blue" | "dark"; href?: string }) {
  const cls = {
    white: "bg-surface [&_.lbl]:text-subtle",
    dark: "bg-deep text-on-deep [&_.lbl]:text-on-deep/70",
    green: "bg-tint-green [&_.lbl]:text-tint-green-ink",
    pink: "bg-tint-pink [&_.lbl]:text-tint-pink-ink",
    sand: "bg-tint-sand [&_.lbl]:text-tint-sand-ink",
    blue: "bg-tint-blue [&_.lbl]:text-tint-blue-ink",
  }[tone];
  const body = (
    <div className={`flex h-full flex-col gap-1.5 rounded-card p-6 ${cls}`}>
      <span className="lbl text-xs font-bold">{label}</span>
      <span className="text-[2rem] font-extrabold leading-none tracking-[-0.02em]">{value}</span>
      {note && <span className="lbl text-xs font-semibold">{note}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Vignette produit sur fond teinté, comme dans les tableaux de la maquette. */
export function Thumb({ src, tint, size = 48 }: { src?: string; tint: "green" | "blue" | "pink" | "sand"; size?: number }) {
  const bg = { green: "bg-tint-green", blue: "bg-tint-blue", pink: "bg-tint-pink", sand: "bg-tint-sand" }[tint];
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${bg}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- vignette admin */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return <span className={`flex shrink-0 items-center justify-center rounded-pill bg-tint-blue text-xs font-bold text-tint-blue-ink ${className}`}>{initials || "?"}</span>;
}
