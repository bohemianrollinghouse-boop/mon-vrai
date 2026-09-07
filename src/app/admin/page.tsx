import Link from "next/link";
import { Card, PageHeader, Pill, Stat } from "@/components/admin/ui";
import { listContactMessages } from "@/lib/db/content";
import { listOrders } from "@/lib/db/orders";
import { listAllProducts } from "@/lib/db/products";
import { formatEuro } from "@/lib/domain/money";
import { ORDER_STATUS_LABELS } from "@/lib/domain/order-state";

export const dynamic = "force-dynamic";

/*
 * Tableau de bord : ce qui demande une action aujourd'hui — commandes à préparer,
 * messages non lus, stocks bas — puis les dernières commandes.
 */
export default async function AdminHome() {
  const [orders, messages, products] = await Promise.all([listOrders({ limit: 200 }), listContactMessages(50), listAllProducts()]);

  const toPrepare = orders.filter((o) => o.status === "paid").length;
  const preparing = orders.filter((o) => o.status === "preparing").length;
  const unread = messages.filter((m) => !m.read).length;
  const lowStock = products.filter((p) => p.stock !== null && p.stock <= 3 && p.status === "published");
  const revenue = orders
    .filter((o) => o.livemode && !["cancelled", "refunded", "pending_payment"].includes(o.status))
    .reduce((s, o) => s + o.totals.total, 0);

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`${orders.length} commandes · ${products.length} produits`} />

      <div className="grid grid-cols-4 gap-4 max-[899px]:grid-cols-2">
        <Stat label="À préparer" value={toPrepare} href="/admin/commandes?statut=paid" />
        <Stat label="En préparation" value={preparing} href="/admin/commandes?statut=preparing" />
        <Stat label="Messages non lus" value={unread} href="/admin/messages" />
        <Stat label="Encaissé" value={formatEuro(revenue)} />
      </div>

      <div className="mt-6 grid grid-cols-[2fr_1fr] gap-4 max-[899px]:grid-cols-1">
        <Card title="Dernières commandes">
          {orders.length === 0 ? (
            <p className="text-sm text-muted">Aucune commande pour le moment.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/admin/commandes/${o.id}`} className="font-bold hover:underline">
                      {o.number}
                    </Link>
                    <span className="truncate text-xs text-subtle">
                      {o.email} · {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill tone={o.status === "paid" ? "warn" : o.status === "shipped" || o.status === "delivered" ? "ok" : "neutral"}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </Pill>
                    <span className="font-bold">{formatEuro(o.totals.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Stocks bas">
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted">Rien à signaler.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {lowStock.map((p) => (
                  <li key={p.slug} className="flex justify-between gap-3">
                    <Link href={`/admin/produits/${p.slug}`} className="font-semibold hover:underline">
                      {p.title}
                    </Link>
                    <Pill tone={p.stock === 0 ? "warn" : "neutral"}>{p.stock} en stock</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Raccourcis">
            <ul className="flex flex-col gap-2 text-sm font-semibold">
              <li>
                <Link href="/admin/produits/nouveau" className="hover:underline">
                  + Nouveau produit
                </Link>
              </li>
              <li>
                <Link href="/admin/pages/nouvelle" className="hover:underline">
                  + Nouvelle page
                </Link>
              </li>
              <li>
                <Link href="/admin/contenus" className="hover:underline">
                  Modifier l'accueil
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
