import Link from "next/link";
import { PageHeader, Table } from "@/components/admin/ui";
import { listCustomers } from "@/lib/db/customers";
import { listOrders } from "@/lib/db/orders";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/*
 * Clients : la liste des comptes, avec le nombre de commandes et le total dépensé.
 * Les données personnelles restent minimales — un client se supprime depuis sa fiche
 * Auth et eraseCustomer() (RGPD), pas depuis cette liste.
 */
export default async function CustomersPage() {
  const [customers, orders] = await Promise.all([listCustomers(300), listOrders({ limit: 1000 })]);
  const byUid = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    if (!o.customerUid || o.status === "cancelled" || o.status === "pending_payment") continue;
    const cur = byUid.get(o.customerUid) ?? { count: 0, total: 0 };
    byUid.set(o.customerUid, { count: cur.count + 1, total: cur.total + o.totals.total });
  }

  return (
    <>
      <PageHeader title="Clients" subtitle={`${customers.length} comptes`} />
      {customers.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted">Aucun compte client pour le moment.</p>
      ) : (
        <Table head={["Client", "E-mail", "Inscrit le", "Commandes", "Total", "Newsletter"]}>
          {customers.map((c) => {
            const stats = byUid.get(c.uid) ?? { count: 0, total: 0 };
            return (
              <tr key={c.uid} className="hover:bg-paper">
                <td className="font-bold">{c.name || <span className="font-normal text-subtle">-</span>}</td>
                <td>
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                </td>
                <td className="text-subtle">{new Date(c.createdAt).toLocaleDateString("fr-FR")}</td>
                <td>
                  {stats.count > 0 ? (
                    <Link href={`/admin/commandes`} className="hover:underline">
                      {stats.count}
                    </Link>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="font-semibold">{formatEuro(stats.total)}</td>
                <td className="text-subtle">{c.newsletter?.optIn ? "oui" : "-"}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
