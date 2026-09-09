import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderProgress } from "@/components/site/OrderProgress";
import { requireUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import { ORDER_STATUS_LABELS } from "@/lib/domain/order-state";

export const metadata: Metadata = { title: "Détail de la commande" };
export const dynamic = "force-dynamic";

/** Détail d'une commande, réservé à son propriétaire. */
export default async function AccountOrderPage({ params }: PageProps<"/compte/commandes/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/compte/commandes/${id}`);
  const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
  // Propriétaire : compte rattaché, ou même e-mail à condition qu'il soit vérifié.
  const byEmail = user.emailVerified && order?.email === user.email.toLowerCase();
  if (!order || (order.customerUid !== user.uid && !byEmail)) notFound();
  const a = order.shippingAddress;

  return (
    <section className="site-wrap flex flex-col gap-5 py-6 pb-[4.5rem]">
      <Link href="/compte" className="w-fit text-xs font-semibold text-subtle hover:text-ink">
        ← Mes commandes
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold leading-[1.04] tracking-[-0.02em]">Commande {order.number}</h1>
        <span className="rounded-pill bg-white px-4 py-2 text-xs font-bold">{ORDER_STATUS_LABELS[order.status]}</span>
      </div>

      {["paid", "preparing", "shipped", "delivered"].includes(order.status) && <OrderProgress order={order} preorderShipFrom={settings.shipping.preorderShipFrom} />}

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-4 max-[899px]:grid-cols-1">
        <div className="flex flex-col gap-4 rounded-card bg-white p-7">
          <h2 className="text-base font-extrabold">Articles</h2>
          {order.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[56px_1fr_auto] items-center gap-3.5 text-sm">
              {l.image ? <Image src={l.image.url} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover" /> : <span className="h-14 w-14 rounded-xl bg-paper" />}
              <span className="flex flex-col">
                <span className="font-bold">{l.title}</span>
                <span className="text-xs text-subtle">
                  {l.qty} × {formatEuro(l.unitPrice)}
                  {l.preorder && " · précommande"}
                </span>
              </span>
              <span className="font-extrabold">{formatEuro(l.unitPrice * l.qty)}</span>
            </div>
          ))}
          <dl className="flex flex-col gap-2 border-t border-line pt-4 text-sm font-semibold">
            <Row k="Sous-total" v={formatEuro(order.totals.subtotal)} />
            <Row k="Livraison" v={order.totals.shipping ? formatEuro(order.totals.shipping) : "Offerte"} />
            {order.totals.discount > 0 && <Row k="Remise" v={`−${formatEuro(order.totals.discount)}`} />}
            <div className="flex justify-between border-t border-line pt-3 text-base font-extrabold">
              <dt>Total</dt>
              <dd>{formatEuro(order.totals.total)}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-card bg-white p-7 text-sm">
            <h2 className="text-base font-extrabold">Livraison</h2>
            <address className="not-italic leading-relaxed">
              <strong>{a.name}</strong>
              <br />
              {a.line1}
              {a.line2 && (
                <>
                  <br />
                  {a.line2}
                </>
              )}
              <br />
              {a.postalCode} {a.city}
            </address>
            {order.delivery?.relay && (
              <p className="rounded-[14px] bg-tint-green px-4 py-3 text-xs font-semibold text-tint-green-ink">
                Point relais : {order.delivery.relay.name}, {order.delivery.relay.street}, {order.delivery.relay.postalCode} {order.delivery.relay.city}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-card bg-white p-7 text-sm">
            <h2 className="text-base font-extrabold">Documents</h2>
            {order.invoice ? (
              <a href={`/api/factures/${order.id}`} target="_blank" rel="noreferrer" className="w-fit rounded-pill bg-paper px-4 py-2.5 text-xs font-bold">
                Facture {order.invoice.number} (PDF)
              </a>
            ) : (
              <span className="text-xs text-subtle">La facture apparaît ici dès son émission.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
