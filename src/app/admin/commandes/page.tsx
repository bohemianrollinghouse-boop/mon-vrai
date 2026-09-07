import Link from "next/link";
import { PageHeader, Pill, Table } from "@/components/admin/ui";
import { listOrders } from "@/lib/db/orders";
import { formatEuro } from "@/lib/domain/money";
import { ORDER_STATUS_LABELS } from "@/lib/domain/order-state";
import { OrderStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const TONE: Record<OrderStatus, "neutral" | "ok" | "warn" | "muted"> = {
  pending_payment: "muted",
  paid: "warn",
  preparing: "neutral",
  shipped: "ok",
  delivered: "ok",
  cancelled: "muted",
  refunded: "muted",
};

export default async function OrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  const { statut } = await searchParams;
  const filter = OrderStatus.safeParse(statut);
  const orders = await listOrders({ status: filter.success ? filter.data : undefined, limit: 200 });

  return (
    <>
      <PageHeader title="Commandes" subtitle={`${orders.length} ${filter.success ? ORDER_STATUS_LABELS[filter.data].toLowerCase() + "s" : "au total"}`} />
      <nav className="mb-5 flex flex-wrap gap-1.5 text-[0.8125rem] font-semibold" aria-label="Filtrer par statut">
        <Link href="/admin/commandes" className={`rounded-pill px-3.5 py-2 ${!filter.success ? "bg-ink text-white" : "bg-white"}`}>
          Toutes
        </Link>
        {OrderStatus.options.map((s) => (
          <Link key={s} href={`/admin/commandes?statut=${s}`} className={`rounded-pill px-3.5 py-2 ${filter.success && filter.data === s ? "bg-ink text-white" : "bg-white"}`}>
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-card bg-white p-6 text-sm text-muted">Aucune commande.</p>
      ) : (
        <Table head={["Numéro", "Date", "Client", "Articles", "Total", "Statut", "Facture"]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-paper">
              <td>
                <Link href={`/admin/commandes/${o.id}`} className="font-bold hover:underline">
                  {o.number}
                </Link>
              </td>
              <td className="text-subtle">{new Date(o.createdAt).toLocaleDateString("fr-FR")}</td>
              <td>
                <div className="flex flex-col">
                  <span className="font-semibold">{o.shippingAddress.name}</span>
                  <span className="text-xs text-subtle">{o.email}</span>
                </div>
              </td>
              <td>{o.lines.reduce((n, l) => n + l.qty, 0)}</td>
              <td className="font-bold">{formatEuro(o.totals.total)}</td>
              <td>
                <Pill tone={TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Pill>
              </td>
              <td className="text-subtle">{o.invoice?.number ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
