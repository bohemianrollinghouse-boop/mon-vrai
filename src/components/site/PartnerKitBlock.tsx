import Image from "next/image";
import Link from "next/link";
import type { PartnerKit } from "@/lib/db/partner";
import type { Order } from "@/lib/domain/types";

/*
 * Kit de bienvenue dans l'espace partenaire. Deux états, jamais les deux : le bon de
 * commande tant qu'il n'a pas été commandé, le suivi une fois qu'il l'a été. Le suivi
 * vient de la commande elle-même — celui que Boxtal remonte, ou celui qu'un
 * administrateur a saisi à la main pour une expédition faite autrement.
 */
export function PartnerKitBlock({ kit }: { kit: PartnerKit }) {
  // Un kit déjà commandé garde son suivi, même si la sélection a changé depuis.
  if (kit.order) return <KitTracking order={kit.order} prototype={kit.prototype} />;
  return kit.offered ? <KitOffer kit={kit} /> : null;
}

/*
 * Mention des prototypes : une ligne en petit, au pied du bloc. Le partenaire doit
 * savoir que la reliure ou la teinte bougeront encore, sans que ce soit la première
 * chose qu'il lise.
 */
function PrototypeNote({ className = "" }: { className?: string }) {
  return <span className={`text-xs ${className}`}>Ces exemplaires sont des prototypes : la version définitive peut différer légèrement.</span>;
}

function KitOffer({ kit }: { kit: PartnerKit }) {
  return (
    <div id="kit" className="grid scroll-mt-24 grid-cols-[1fr_auto] items-center gap-8 rounded-panel bg-tint-sand p-10 max-[899px]:grid-cols-1 max-[749px]:p-8">
      <div className="flex flex-col gap-3">
        <span className="w-fit rounded-pill bg-white px-3.5 py-2 text-xs font-bold">Offert</span>
        <h2 className="text-[1.625rem] font-extrabold tracking-[-0.01em]">{kit.title}</h2>
        {kit.text && <p className="text-sm leading-relaxed text-tint-sand-ink">{kit.text}</p>}
        <ul className="mt-1 flex flex-wrap gap-2.5">
          {kit.items.map((item) => (
            <li key={item.slug} className="flex items-center gap-2.5 rounded-thumb bg-white py-2 pl-2 pr-4">
              {item.image ? (
                <Image src={item.image.url} alt={item.image.alt || item.title} width={40} height={40} className="h-10 w-10 rounded-[10px] object-cover" />
              ) : (
                <span className="h-10 w-10 rounded-[10px] bg-paper" />
              )}
              <span className="flex flex-col">
                <span className="text-[0.8125rem] font-bold">{item.title}</span>
                {item.qty > 1 && <span className="text-[0.6875rem] text-subtle">× {item.qty}</span>}
              </span>
            </li>
          ))}
        </ul>
        {kit.prototype && <PrototypeNote className="text-tint-sand-ink" />}
      </div>
      <Link href="/partenaire/kit" className="w-fit whitespace-nowrap rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white">
        Commander mon kit
      </Link>
    </div>
  );
}

function KitTracking({ order, prototype }: { order: Order; prototype: boolean }) {
  const number = order.tracking?.number ?? order.boxtal?.trackingNumber ?? "";
  const url = order.tracking?.url ?? order.boxtal?.trackingUrl ?? "";
  const carrier = order.tracking?.carrier ?? order.delivery?.rateName ?? "";
  const message = order.boxtal?.trackingMessage ?? "";
  const relay = order.delivery?.relay;
  const shipped = order.status === "shipped" || order.status === "delivered";
  const state = order.status === "delivered" ? "Livré" : shipped ? "En route" : "En préparation";
  const a = order.shippingAddress;

  return (
    <div id="kit" className="flex scroll-mt-24 flex-col gap-4 rounded-panel bg-tint-green p-10 max-[749px]:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-tint-green-ink">Votre kit de bienvenue</span>
          <h2 className="text-[1.625rem] font-extrabold tracking-[-0.01em]">Commande {order.number}</h2>
        </div>
        <span className="rounded-pill bg-white px-3.5 py-2 text-xs font-bold">{state}</span>
      </div>

      <div className="grid grid-cols-3 gap-5 border-t border-white/60 pt-4 text-[0.8125rem] max-[749px]:grid-cols-1">
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-tint-green-ink">Livraison</span>
          <span className="font-semibold leading-relaxed">
            {carrier || "Livraison"}
            <br />
            {relay ? `${relay.name} · ${relay.postalCode} ${relay.city}` : `${a.line1}, ${a.postalCode} ${a.city}`}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-tint-green-ink">Suivi</span>
          <span className="font-semibold leading-relaxed">
            {number ? (
              url ? (
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {number}
                </a>
              ) : (
                number
              )
            ) : (
              "Disponible dès l'expédition"
            )}
            {message && (
              <>
                <br />
                <span className="text-xs text-tint-green-ink">{message}</span>
              </>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-tint-green-ink">Contenu</span>
          <span className="font-semibold leading-relaxed">
            {order.lines.map((l) => (
              <span key={l.productSlug} className="block">
                {l.title}
                {l.qty > 1 ? ` × ${l.qty}` : ""}
              </span>
            ))}
          </span>
        </div>
      </div>
      {prototype && <PrototypeNote className="text-tint-green-ink" />}
    </div>
  );
}
