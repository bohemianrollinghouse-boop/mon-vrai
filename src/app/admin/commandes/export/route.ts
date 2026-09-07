import { NextResponse } from "next/server";
import { ADMIN_STATUS_LABELS, ORDER_FILTERS, matchesQuery } from "@/lib/admin/order-ui";
import { getSessionUser } from "@/lib/auth/session";
import { listOrders } from "@/lib/db/orders";

/** Export CSV des commandes affichées (mêmes filtres que la liste). Excel-compatible : BOM + point-virgule. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const url = new URL(request.url);
  const filter = ORDER_FILTERS.find((f) => f.key === url.searchParams.get("statut"));
  const q = url.searchParams.get("q") ?? "";
  const orders = (await listOrders({ limit: 2000 })).filter((o) => (!filter || filter.statuses.includes(o.status)) && matchesQuery(o, q));

  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const head = ["Numéro", "Date", "Statut", "Mode", "Client", "E-mail", "Adresse", "Code postal", "Ville", "Pays", "Articles", "Sous-total", "Livraison", "Remise", "Total", "Facture", "Transporteur", "Suivi"];
  const rows = orders.map((o) =>
    [
      o.number,
      new Date(o.createdAt).toLocaleString("fr-FR"),
      ADMIN_STATUS_LABELS[o.status],
      o.livemode ? "live" : "test",
      o.shippingAddress.name,
      o.email,
      [o.shippingAddress.line1, o.shippingAddress.line2].filter(Boolean).join(", "),
      o.shippingAddress.postalCode,
      o.shippingAddress.city,
      o.shippingAddress.country,
      o.lines.map((l) => `${l.qty}× ${l.title}`).join(" | "),
      euros(o.totals.subtotal),
      euros(o.totals.shipping),
      euros(o.totals.discount),
      euros(o.totals.total),
      o.invoice?.number ?? "",
      o.tracking?.carrier ?? "",
      o.tracking?.number ?? "",
    ]
      .map(cell)
      .join(";"),
  );
  const csv = "﻿" + [head.map(cell).join(";"), ...rows].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="commandes-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
