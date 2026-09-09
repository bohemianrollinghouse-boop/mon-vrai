import type { Metadata } from "next";
import { RefreshUntilOrder } from "@/components/site/RefreshUntilOrder";
import { PillLink } from "@/components/site/ui";
import { findOrderByCheckoutSession, findOrderByPaymentIntent, getOrder } from "@/lib/db/orders";
import { formatEuro } from "@/lib/domain/money";
import { systemPath } from "@/lib/domain/system-pages";

export const metadata: Metadata = { title: "Merci" };
export const dynamic = "force-dynamic";

/*
 * Page de retour après paiement. Elle n'écrit rien : la commande est créée par le
 * webhook, qui peut arriver une seconde après le client. Si elle n'est pas encore là,
 * on le dit calmement — le paiement est bien pris, l'e-mail suivra.
 */
export default async function ThankYouPage({ searchParams }: PageProps<"/commande/merci">) {
  const { session_id, payment_intent, order: orderParam } = await searchParams;
  const order =
    typeof orderParam === "string"
      ? await getOrder(orderParam)
      : typeof payment_intent === "string"
        ? await findOrderByPaymentIntent(payment_intent)
        : typeof session_id === "string"
          ? await findOrderByCheckoutSession(session_id)
          : null;

  return (
    <section className="site-wrap py-16">
      <RefreshUntilOrder found={Boolean(order)} />
      <div className="mx-auto flex max-w-[640px] flex-col items-center gap-4 rounded-panel bg-white p-16 text-center max-[599px]:px-6 max-[599px]:py-9">
        <span className="eyebrow text-tint-green-ink">Merci</span>
        <h1 className="display-2">{order ? `Commande ${order.number} confirmée` : "Votre paiement est bien pris"}</h1>
        {order ? (
          <p className="leading-relaxed text-muted">
            {order.lines.reduce((n, l) => n + l.qty, 0)} {order.lines.length > 1 || order.lines[0]?.qty > 1 ? "livres" : "livre"} · {formatEuro(order.totals.total)}.
            Un e-mail de confirmation part à <strong className="text-ink">{order.email}</strong>.
          </p>
        ) : (
          <p className="leading-relaxed text-muted">
            Nous finalisons l'enregistrement de votre commande. Vous recevrez un e-mail de confirmation dans quelques instants.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2.5 pt-2">
          <PillLink href={systemPath("account")} variant="dark" className="text-[0.8125rem]">
            Suivre ma commande
          </PillLink>
          <PillLink href={systemPath("catalogue")} variant="paper" className="text-[0.8125rem]">
            Continuer la visite
          </PillLink>
        </div>
      </div>
    </section>
  );
}
