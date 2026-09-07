import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/*
 * Primitives du back-office. Sobres, denses, lisibles : c'est un outil de travail, pas
 * une vitrine. Les formulaires sont de vrais formulaires HTML vers des actions serveur ;
 * les composants ici ne portent aucune logique.
 */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card bg-white p-6 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.08em] text-subtle">{title}</h2>}
      {children}
    </section>
  );
}

const input =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus-visible:border-ink disabled:bg-paper disabled:text-subtle";

export { Field } from "./Field";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${input} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${input} min-h-[6rem] resize-y ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${input} cursor-pointer ${props.className ?? ""}`} />;
}

/** Interrupteur oui/non : une case à cocher stylée, donc soumise comme telle (« on » ou absente). */
export function Switch({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" {...props} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-pill bg-line transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[0.8125rem] font-bold">{label}</span>
        {hint && <span className="text-xs text-subtle">{hint}</span>}
      </span>
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

type Tone = "primary" | "secondary" | "danger" | "ghost";
const TONE: Record<Tone, string> = {
  primary: "bg-ink text-white hover:opacity-80",
  secondary: "bg-paper text-ink hover:bg-line",
  danger: "bg-danger-bg text-danger hover:opacity-80",
  ghost: "text-ink underline-offset-4 hover:underline",
};

export function Button({ tone = "primary", className = "", type = "submit", ...props }: ComponentProps<"button"> & { tone?: Tone }) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex items-center justify-center rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold transition-opacity disabled:opacity-50 ${TONE[tone]} ${className}`}
    />
  );
}

export function ButtonLink({ tone = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { tone?: Tone }) {
  return <Link {...props} className={`inline-flex items-center justify-center rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${TONE[tone]} ${className}`} />;
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: ReactNode }) {
  const cls = tone === "ok" ? "bg-tint-green text-tint-green-ink" : tone === "error" ? "bg-danger-bg text-danger" : "bg-tint-blue text-tint-blue-ink";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-semibold ${cls}`}>
      {children}
    </p>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">
            {head.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr>td]:px-4 [&>tr>td]:py-3">{children}</tbody>
      </table>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "muted" }) {
  const cls = { neutral: "bg-paper", ok: "bg-tint-green text-tint-green-ink", warn: "bg-tint-sand text-tint-sand-ink", muted: "bg-line text-subtle" }[tone];
  return <span className={`inline-block rounded-pill px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

export function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="flex flex-col gap-1 rounded-card bg-white p-5">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">{label}</span>
      <span className="text-2xl font-extrabold">{value}</span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
