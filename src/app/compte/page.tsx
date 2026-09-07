import type { Metadata } from "next";
import Link from "next/link";
import { PillLink } from "@/components/site/ui";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { listOrdersForCustomer } from "@/lib/db/orders";
import { formatEuro } from "@/lib/domain/money";
import { ORDER_STATUS_LABELS } from "@/lib/domain/order-state";
import { systemPath } from "@/lib/domain/system-pages";

export const metadata: Metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

/*
 * Espace client : ses commandes, rien de plus pour l'instant. Les adresses sont
 * saisies chez Stripe au paiement ; les rééditer ici viendra si le besoin apparaît.
 */
export default async function AccountPage() {
  const user = await requireUser();
  const orders = await listOrdersForCustomer(user.uid);

  return (
    <section className="site-wrap py-8 pb-[4.5rem]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-subtle">Mon compte</span>
          <h1 className="display-1 text-[clamp(1.875rem,4vw,2.75rem)]">Bonjour{user.name ? ` ${user.name.split(" ")[0]}` : ""}</h1>
          <span className="text-sm font-semibold text-muted">{user.email}</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {user.isAdmin && (
            <PillLink href="/admin" variant="light" size="sm">
              Administration
            </PillLink>
          )}
          <form action={signOut}>
            <button type="submit" className="rounded-pill bg-white px-4 py-2.5 text-[0.8125rem] font-bold">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      <h2 className="display-2 mt-10 text-[1.5rem]">Mes commandes</h2>
      {orders.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-4 rounded-card bg-white p-8">
          <p className="text-muted">Aucune commande pour le moment.</p>
          <PillLink href={systemPath("catalogue")} variant="dark" size="sm">
            Voir les imagiers
          </PillLink>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {orders.map((o) => (
            <div key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-card bg-white p-6 max-[599px]:grid-cols-1">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-extrabold">{o.number}</span>
                  <span className="rounded-pill bg-paper px-3 py-1 text-xs font-bold">{ORDER_STATUS_LABELS[o.status]}</span>
                </div>
                <span className="text-sm text-muted">
                  {new Date(o.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} ·{" "}
                  {o.lines.map((l) => `${l.title} × ${l.qty}`).join(", ")}
                </span>
                {o.tracking && (
                  <span className="text-sm font-semibold">
                    {o.tracking.carrier} · {o.tracking.url ? <Link href={o.tracking.url} className="underline">{o.tracking.number}</Link> : o.tracking.number}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 max-[599px]:items-start">
                <span className="text-lg font-extrabold">{formatEuro(o.totals.total)}</span>
                {o.invoice && (
                  <a href={`/api/factures/${o.id}`} target="_blank" rel="noreferrer" className="text-[0.8125rem] font-semibold text-subtle underline">
                    Facture {o.invoice.number}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
