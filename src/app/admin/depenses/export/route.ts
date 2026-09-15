import { NextResponse } from "next/server";
import { CATEGORY_LABELS, FAR_FUTURE, METHOD_LABELS, RECURRENCE_LABELS, findPeriod, matchesExpense, periodStart } from "@/lib/admin/expense-ui";
import { inPeriod } from "@/lib/admin/expenses";
import { getSessionUser } from "@/lib/auth/session";
import { listDocuments } from "@/lib/db/documents";
import { listExpenses } from "@/lib/db/expenses";
import { listAllProducts } from "@/lib/db/products";
import { dayKey } from "@/lib/stats/keys";

/*
 * Export des mouvements affichés (mêmes filtres que la liste), pour le comptable ou la
 * déclaration. Excel-compatible : BOM UTF-8, point-virgule, virgule décimale. Les
 * sorties sortent en négatif — c'est ainsi qu'un tableur en fait une somme juste.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const url = new URL(request.url);
  const period = findPeriod(url.searchParams.get("periode"));
  const poste = url.searchParams.get("poste");
  const q = url.searchParams.get("q") ?? "";

  const [all, products, documents] = await Promise.all([listExpenses(), listAllProducts(), listDocuments()]);
  const today = dayKey(Date.now());
  const rows = inPeriod(all, periodStart(period, today), FAR_FUTURE)
    .filter((e) => (!poste || e.category === poste) && matchesExpense(e, q))
    // Du plus ancien au plus récent : l'ordre d'un journal comptable.
    .reverse();

  const titleOf = (slug: string) => products.find((p) => p.slug === slug)?.title ?? slug;
  const docOf = (id: string) => documents.find((d) => d.id === id)?.title ?? "";
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const signed = (cents: number, out: boolean) => ((out ? -cents : cents) / 100).toFixed(2).replace(".", ",");

  const head = ["Date", "Sens", "Poste", "Intitulé", "Fournisseur", "Montant TTC", "Règlement", "État", "Rythme", "Titre concerné", "Exemplaires couverts", "Justificatif", "Note"];
  const body = rows.map((e) =>
    [
      e.date,
      e.direction === "in" ? "Entrée" : "Sortie",
      CATEGORY_LABELS[e.category],
      e.label,
      e.supplier,
      signed(e.amount, e.direction === "out"),
      METHOD_LABELS[e.method],
      e.status === "paid" ? "Payé" : "Engagé",
      RECURRENCE_LABELS[e.recurrence],
      e.productSlug ? titleOf(e.productSlug) : "",
      e.units || "",
      e.documentId ? docOf(e.documentId) : "",
      e.note.replace(/\r?\n/g, " "),
    ]
      .map(cell)
      .join(";"),
  );

  const csv = `﻿${[head.map(cell).join(";"), ...body].join("\r\n")}\r\n`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="depenses-${period.key}-${today}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
