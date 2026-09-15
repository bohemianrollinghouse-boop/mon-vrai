import type { PillTone } from "@/components/admin/ui";
import type { CashDirection, DocKind, Expense, ExpenseCategory, ExpenseMethod, ExpenseRecurrence } from "@/lib/domain/types";
import { daysBefore } from "./expenses";

/*
 * Vocabulaire de l'écran « Dépenses » et de la bibliothèque de documents : un seul
 * endroit pour les libellés français, les regroupements et les teintes, afin que la
 * liste, les filtres, l'export CSV et les formulaires parlent la même langue.
 */

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  certification: "Normes & conformité (CE)",
  lab: "Laboratoire & essais",
  isbn: "ISBN & dépôt légal",
  printing: "Impression & fabrication",
  packaging: "Emballages",
  shipping: "Port & affranchissement",
  design: "Création & illustration",
  marketing: "Communication & publicité",
  software: "Logiciels & abonnements",
  fees: "Frais bancaires",
  accounting: "Comptabilité & juridique",
  taxes: "Cotisations & impôts",
  insurance: "Assurances",
  supplies: "Matériel & fournitures",
  travel: "Déplacements",
  funding: "Apport & subvention",
  refund: "Remboursement reçu",
  offline_sales: "Vente hors site",
  other: "Divers",
};

/** Postes de sortie, dans l'ordre où ils reviennent dans la vie de la maison d'édition. */
export const OUT_CATEGORIES: ExpenseCategory[] = [
  "certification",
  "lab",
  "isbn",
  "printing",
  "design",
  "packaging",
  "shipping",
  "marketing",
  "software",
  "accounting",
  "taxes",
  "insurance",
  "fees",
  "supplies",
  "travel",
  "other",
];

/** Postes d'entrée : tout ce que les commandes du site ne racontent pas. */
export const IN_CATEGORIES: ExpenseCategory[] = ["funding", "offline_sales", "refund", "other"];

export const categoriesFor = (direction: CashDirection): ExpenseCategory[] => (direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES);

export const METHOD_LABELS: Record<ExpenseMethod, string> = {
  card: "Carte",
  transfer: "Virement",
  debit: "Prélèvement",
  cash: "Espèces",
  check: "Chèque",
  other: "Autre",
};

export const RECURRENCE_LABELS: Record<ExpenseRecurrence, string> = {
  once: "Ponctuel",
  monthly: "Tous les mois",
  quarterly: "Tous les trimestres",
  yearly: "Tous les ans",
};

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  certification: "Norme CE / conformité",
  lab: "Rapport de laboratoire",
  isbn: "ISBN / dépôt légal",
  invoice: "Facture fournisseur",
  contract: "Contrat",
  insurance: "Assurance",
  tax: "Fiscal & social",
  company: "Société (statuts, Kbis)",
  other: "Autre",
};

export const DOC_KIND_TONE: Record<DocKind, PillTone> = {
  certification: "ok",
  lab: "blue",
  isbn: "pink",
  invoice: "neutral",
  contract: "warn",
  insurance: "warn",
  tax: "muted",
  company: "muted",
  other: "muted",
};

/** « 2026-03-08 » → « 8 mars 2026 ». Une chaîne vide reste un tiret. */
export function dayLabel(day: string): string {
  if (!day) return "—";
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** « 2026-03 » → « mars 2026 ». */
export function monthLabel(month: string): string {
  const d = new Date(`${month}-15T12:00:00`);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Poids d'un fichier, lisible : « 1,4 Mo ». */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/* ---------- Filtres partagés par l'écran et l'export CSV ---------- */

export const PERIODS = [
  { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "90 jours", days: 90 },
  { key: "annee", label: "Année en cours", days: null },
  { key: "tout", label: "Depuis le début", days: null },
] as const;

export type Period = (typeof PERIODS)[number];

/** L'année en cours par défaut : c'est la fenêtre d'un bilan. */
export const DEFAULT_PERIOD: Period = PERIODS[2];

export const findPeriod = (key: unknown): Period => PERIODS.find((p) => p.key === key) ?? DEFAULT_PERIOD;

/** Premier jour de la période ; chaîne vide = depuis le début. */
export function periodStart(period: Period, today: string): string {
  if (period.days) return daysBefore(today, period.days);
  return period.key === "annee" ? `${today.slice(0, 4)}-01-01` : "";
}

/*
 * Borne haute des périodes : une ligne datée à venir (facture reçue, payable plus tard)
 * ne doit pas disparaître de la fenêtre courante.
 */
export const FAR_FUTURE = "9999-12-31";

/** Recherche plein texte minimale sur une ligne : intitulé, fournisseur, note, poste. */
export function matchesExpense(e: Expense, q: string): boolean {
  if (!q) return true;
  const hay = `${e.label} ${e.supplier} ${e.note} ${CATEGORY_LABELS[e.category]}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
