import { NextResponse } from "next/server";
import { CATEGORY_LABELS, FAR_FUTURE, METHOD_LABELS, RECURRENCE_LABELS, findPeriod, matchesExpense, periodStart } from "@/lib/admin/expense-ui";
import { NO_SALES, type SalesFlow, inPeriod } from "@/lib/admin/expenses";
import { COUNTED } from "@/lib/admin/order-ui";
import { partOf } from "@/lib/admin/revenue";
import { getSessionUser } from "@/lib/auth/session";
import { listDocuments } from "@/lib/db/documents";
import { listExpenses } from "@/lib/db/expenses";
import { listOrders } from "@/lib/db/orders";
import { listAllProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { dayKey } from "@/lib/stats/keys";

/*
 * Export des mouvements affichés (mêmes filtres que la liste), pour le comptable ou la
 * déclaration. Excel-compatible : BOM UTF-8, point-virgule, virgule décimale. Les
 * sorties sortent en négatif — c'est ainsi qu'un tableur en fait une somme juste.
 *
 * Les ventes du site et les cotisations qu'elles déclenchent ne sont pas des lignes
 * saisies : elles apparaissent en récapitulatif MENSUEL, marquées « calculé », datées du
 * premier du mois. Sans elles le fichier ne dirait que les frais, alors que l'écran, lui,
 * montre toute la trésorerie. Comme à l'écran, un filtre par poste les écarte : le
 * fichier ne parle plus alors que des lignes retenues.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const url = new URL(request.url);
  const period = findPeriod(url.searchParams.get("periode"));
  const poste = url.searchParams.get("poste");
  const q = url.searchParams.get("q") ?? "";

  const [all, products, documents, orders, settings] = await Promise.all([listExpenses(), listAllProducts(), listDocuments(), listOrders({ limit: 2000 }), getSettings()]);
  const today = dayKey(Date.now());
  const from = periodStart(period, today);

  const entered = inPeriod(all, from, FAR_FUTURE).filter((e) => (!poste || e.category === poste) && matchesExpense(e, q));

  const titleOf = (slug: string) => products.find((p) => p.slug === slug)?.title ?? slug;
  const docOf = (id: string) => documents.find((d) => d.id === id)?.title ?? "";
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  /** Une sortie sort en négatif : le tableur en fait alors une somme juste. */
  const signed = (cents: number, out: boolean) => euros(out ? -cents : cents);

  type Row = { date: string; cells: (string | number)[] };
  const rows: Row[] = entered.map((e) => ({
    date: e.date,
    cells: [
      e.date,
      e.direction === "in" ? "Entrée" : "Sortie",
      CATEGORY_LABELS[e.category],
      e.label,
      e.supplier,
      signed(e.amount, e.direction === "out"),
      "saisi",
      METHOD_LABELS[e.method],
      e.status === "paid" ? "Payé" : "Engagé",
      RECURRENCE_LABELS[e.recurrence],
      e.productSlug ? titleOf(e.productSlug) : "",
      e.units || "",
      e.documentId ? docOf(e.documentId) : "",
      e.note.replace(/\r?\n/g, " "),
    ],
  }));

  if (!poste && !q) {
    const byMonth = new Map<string, SalesFlow>();
    for (const o of orders) {
      if (!o.livemode || !COUNTED.includes(o.status) || o.kit) continue;
      const day = dayKey(o.createdAt);
      if (from && day < from) continue;
      const month = day.slice(0, 7);
      const f = byMonth.get(month) ?? { ...NO_SALES };
      byMonth.set(month, { orders: f.orders + 1, revenue: f.revenue + o.totals.total, urssaf: f.urssaf + partOf(o.totals.total, settings.costs.urssafBp) });
    }
    const rate = `${(settings.costs.urssafBp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
    for (const [month, f] of byMonth) {
      const date = `${month}-01`;
      rows.push({ date, cells: [date, "Entrée", "Ventes du site", `Ventes encaissées — ${month}`, "", euros(f.revenue), "calculé", "", "Payé", "Ponctuel", "", "", "", `${f.orders} commande(s), port compris`] });
      rows.push({ date, cells: [date, "Sortie", CATEGORY_LABELS.taxes, `Cotisations URSSAF — ${month}`, "URSSAF", signed(f.urssaf, true), "calculé", "", "Provision", "Ponctuel", "", "", "", `${rate} des ventes du mois`] });
    }
  }

  // Du plus ancien au plus récent : l'ordre d'un journal comptable.
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const head = ["Date", "Sens", "Poste", "Intitulé", "Fournisseur", "Montant TTC", "Origine", "Règlement", "État", "Rythme", "Titre concerné", "Exemplaires couverts", "Justificatif", "Note"];
  const csv = `﻿${[head.map(cell).join(";"), ...rows.map((r) => r.cells.map(cell).join(";"))].join("\r\n")}\r\n`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="depenses-${period.key}-${today}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
