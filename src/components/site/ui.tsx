import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tint } from "@/lib/domain/types";

/*
 * Primitives visuelles de la maquette. Trois variantes de pilule, les teintes des
 * cartes, et rien de plus : la charte tient dans ce fichier.
 */

type Variant = "dark" | "light" | "ghost" | "paper";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  dark: "bg-ink text-white",
  light: "bg-white text-ink",
  ghost: "border-[1.5px] border-white/80 text-white",
  paper: "bg-paper text-ink",
};

const SIZE: Record<Size, string> = {
  sm: "px-4 py-2.5 text-[0.8125rem]",
  md: "px-6 py-3.5 text-sm",
  lg: "px-[1.875rem] py-[1.125rem] text-sm",
};

export function pillClass(variant: Variant = "dark", size: Size = "md", extra = ""): string {
  return `inline-flex items-center justify-center rounded-pill font-bold leading-tight transition-opacity hover:opacity-75 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

type PillLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function PillLink({ variant = "dark", size = "md", className = "", ...props }: PillLinkProps) {
  return <Link {...props} className={pillClass(variant, size, className)} />;
}

type PillButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function PillButton({ variant = "dark", size = "md", className = "", type = "submit", ...props }: PillButtonProps) {
  return <button type={type} {...props} className={`${pillClass(variant, size, className)} cursor-pointer disabled:opacity-50`} />;
}

/** Petite pastille d'information (badge « Nouveauté », filtre actif…). */
export function Chip({ active = false, children, className = "" }: { active?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-4 py-2.5 text-[0.8125rem] font-semibold leading-tight ${
        active ? "bg-ink text-white" : "bg-white text-ink"
      } ${className}`}
    >
      {children}
    </span>
  );
}

export const TINT_BG: Record<Tint, string> = {
  green: "bg-tint-green",
  blue: "bg-tint-blue",
  pink: "bg-tint-pink",
  sand: "bg-tint-sand",
};

export const TINT_INK: Record<Tint, string> = {
  green: "text-tint-green-ink",
  blue: "text-tint-blue-ink",
  pink: "text-tint-pink-ink",
  sand: "text-tint-sand-ink",
};

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}
