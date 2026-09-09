import Link from "next/link";
import { formatEuro } from "@/lib/domain/money";
import type { Order } from "@/lib/domain/types";

/*
 * Suivi d'une commande en quatre étapes (maquette 7b) : confirmée, payée, expédiée,
 * livrée - puis livraison, paiement, liens vers le détail et la facture.
 */
export function OrderProgress({ order, preorderShipFrom }: { order: Order; preorderShipFrom?: string }) {
  const at = (s: Order["status"]) => order.timeline.find((t) => t.status === s)?.at;
  const shipped = at("shipped");
  const delivered = at("delivered");
  const shipHint = shipped ? shortDate(shipped) : order.lines.some((l) => l.preorder) && preorderShipFrom ? `dès le ${shortDate(new Date(preorderShipFrom).getTime())}` : "sous 2 jours";
  const steps = [
    { label: "Confirmée", done: true, hint: shortDate(order.createdAt) },
    { label: "Payée", done: true, hint: shortDate(at("paid") ?? order.createdAt) },
    { label: "Expédiée", done: Boolean(shipped), hint: shipHint, current: !shipped },
    { label: "Livrée", done: Boolean(delivered), hint: delivered ? shortDate(delivered) : "~1 semaine", current: Boolean(shipped) && !delivered },
  ];
  const relay = order.delivery?.relay;
  const a = order.shippingAddress;
  return (
    <div className="flex flex-col gap-5 rounded-card bg-white p-7">
      <ol className="flex items-start">
        {steps.map((s, i) => (
          <li key={s.label} className="contents">
            <div className="flex flex-1 flex-col items-center gap-2 text-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-pill text-xs font-bold ${s.done ? "bg-ink text-white" : s.current ? "border-2 border-ink" : "border-2 border-line-warm text-subtle"}`}>{s.done ? "✓" : i + 1}</span>
              <span className={`text-xs font-bold ${s.done || s.current ? "" : "text-subtle"}`}>{s.label}</span>
              <span className="text-[0.6875rem] text-subtle">{s.hint}</span>
            </div>
            {i < steps.length - 1 && <span className={`mt-3.5 h-0.5 flex-1 ${steps[i + 1].done || (s.done && steps[i + 1].current) ? "bg-ink" : "bg-line-warm"}`} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-3 gap-5 border-t border-line pt-5 text-[0.8125rem] max-[599px]:grid-cols-1">
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Livraison</span>
          <span className="font-semibold leading-relaxed">
            {order.delivery?.rateName ?? order.tracking?.carrier ?? "Livraison"}
            {relay ? ` · ${relay.name}` : ""}
            <br />
            {relay ? `${relay.street}, ${relay.postalCode} ${relay.city}` : `${a.line1}, ${a.postalCode} ${a.city}`}
          </span>
          {order.tracking && (
            <span className="text-xs font-semibold">
              Suivi : {order.tracking.url ? <a href={order.tracking.url} target="_blank" rel="noreferrer" className="underline">{order.tracking.number}</a> : order.tracking.number}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Paiement</span>
          <span className="font-semibold leading-relaxed">
            Carte bancaire
            <br />
            {formatEuro(order.totals.total)} · taxes incluses
          </span>
        </div>
        <div className="flex flex-col items-end justify-center gap-2 max-[599px]:items-start">
          <Link href={`/compte/commandes/${order.id}`} className="rounded-pill bg-paper px-4 py-2.5 text-xs font-bold">
            Voir le détail
          </Link>
          {order.invoice && (
            <a href={`/api/factures/${order.id}`} target="_blank" rel="noreferrer" className="border-b border-[#ccc] text-xs font-semibold text-subtle">
              Télécharger la facture
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
