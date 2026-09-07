import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { ButtonLink, Card, Checkbox, Field, Input, PageHeader, Pill, Select } from "@/components/admin/ui";
import { issueInvoiceAction, setTrackingAction, transitionOrderAction } from "@/lib/admin/actions/orders";
import { getOrder } from "@/lib/db/orders";
import { formatEuro } from "@/lib/domain/money";
import { canTransition, ORDER_STATUS_LABELS } from "@/lib/domain/order-state";
import { OrderStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: PageProps<"/admin/commandes/[id]">) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const nextStatuses = OrderStatus.options.filter((s) => canTransition(order.status, s));
  const a = order.shippingAddress;

  return (
    <>
      <PageHeader
        title={order.number}
        subtitle={`${new Date(order.createdAt).toLocaleString("fr-FR")} · ${order.email}`}
        actions={
          <>
            <Pill tone={order.status === "paid" ? "warn" : "neutral"}>{ORDER_STATUS_LABELS[order.status]}</Pill>
            <ButtonLink href="/admin/commandes" tone="ghost">
              ← Commandes
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-[2fr_1fr] gap-6 max-[899px]:grid-cols-1">
        <div className="flex flex-col gap-6">
          <Card title="Articles">
            <ul className="flex flex-col divide-y divide-line">
              {order.lines.map((l, i) => (
                <li key={`${l.productSlug}-${i}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    {l.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- vignette admin
                      <img src={l.image.url} alt="" className="h-12 w-12 rounded-md object-cover" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold">{l.title}</span>
                      <span className="text-xs text-subtle">
                        {l.qty} × {formatEuro(l.unitPrice)}
                        {l.preorder && " · précommande"}
                      </span>
                    </div>
                  </div>
                  <span className="font-bold">{formatEuro(l.unitPrice * l.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm">
              <Row k="Sous-total" v={formatEuro(order.totals.subtotal)} />
              <Row k="Livraison" v={order.totals.shipping ? formatEuro(order.totals.shipping) : "Offerte"} />
              {order.totals.discount > 0 && <Row k="Remise" v={`−${formatEuro(order.totals.discount)}`} />}
              {order.totals.tax > 0 && <Row k="dont TVA" v={formatEuro(order.totals.tax)} />}
              <Row k="Total" v={formatEuro(order.totals.total)} strong />
            </dl>
          </Card>

          <Card title="Historique">
            <ol className="flex flex-col gap-2 text-sm">
              {[...order.timeline].reverse().map((t, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="w-40 shrink-0 text-xs text-subtle">{new Date(t.at).toLocaleString("fr-FR")}</span>
                  <span className="font-semibold">{ORDER_STATUS_LABELS[t.status]}</span>
                  {t.by && <span className="text-xs text-subtle">par {t.by}</span>}
                  {t.note && <span className="basis-full pl-40 text-xs text-muted max-[749px]:pl-0">{t.note}</span>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Livraison">
            <address className="text-sm not-italic leading-relaxed">
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
              {a.postalCode} {a.city}, {a.country}
              {a.phone && (
                <>
                  <br />
                  {a.phone}
                </>
              )}
            </address>
            {order.tracking && (
              <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm">
                <strong>{order.tracking.carrier}</strong> · {order.tracking.url ? <a href={order.tracking.url} className="underline" target="_blank" rel="noopener">{order.tracking.number}</a> : order.tracking.number}
              </p>
            )}
          </Card>

          {(order.status === "paid" || order.status === "preparing") && (
            <Card title="Expédier">
              <ActionForm action={setTrackingAction} submitLabel="Enregistrer l'expédition">
                <>
                  <input type="hidden" name="id" value={order.id} />
                  <Field label="Transporteur" name="carrier">
                    <Select name="carrier" defaultValue="Colissimo">
                      <option>Colissimo</option>
                      <option>Mondial Relay</option>
                      <option>Chronopost</option>
                      <option>Lettre suivie</option>
                      <option>Autre</option>
                    </Select>
                  </Field>
                  <Field label="Numéro de suivi" name="number">
                    <Input name="number" required />
                  </Field>
                  <Field label="Lien de suivi" hint="Facultatif." name="url">
                    <Input name="url" type="url" placeholder="https://…" />
                  </Field>
                  <Checkbox name="notify" label="Prévenir le client par e-mail" defaultChecked />
                </>
              </ActionForm>
            </Card>
          )}

          {nextStatuses.length > 0 && (
            <Card title="Changer le statut">
              <ActionForm action={transitionOrderAction} submitLabel="Appliquer" confirm="Confirmer le changement de statut ?">
                <input type="hidden" name="id" value={order.id} />
                <Field label="Nouveau statut">
                  <Select name="to" defaultValue={nextStatuses[0]}>
                    {nextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note" hint="Visible dans l'historique uniquement.">
                  <Input name="note" />
                </Field>
                {nextStatuses.includes("refunded") && (
                  <p className="text-xs text-muted">Le remboursement effectif se fait dans Stripe ; ce statut ne déclenche pas de virement.</p>
                )}
              </ActionForm>
            </Card>
          )}

          <Card title="Facture">
            {order.invoice ? (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  <strong>{order.invoice.number}</strong>
                  <br />
                  <span className="text-subtle">émise le {new Date(order.invoice.issuedAt).toLocaleDateString("fr-FR")}</span>
                </p>
                <a href={`/api/factures/${order.id}`} target="_blank" rel="noreferrer" className="w-fit rounded-pill bg-ink px-3.5 py-2 text-xs font-bold text-white">
                  Ouvrir le PDF
                </a>
              </div>
            ) : !order.livemode ? (
              <p className="text-sm text-muted">Commande de test (clés Stripe de test) : pas de facture, pour garder la numérotation propre.</p>
            ) : order.status === "pending_payment" || order.status === "cancelled" ? (
              <p className="text-sm text-muted">Pas de facture pour une commande non payée.</p>
            ) : (
              <ActionForm action={issueInvoiceAction} submitLabel="Émettre la facture">
                <input type="hidden" name="id" value={order.id} />
                <p className="text-sm text-muted">Numéro séquentiel, sans trou, définitif ; le PDF est généré et archivé.</p>
              </ActionForm>
            )}
          </Card>

          <Card title="Stripe">
            <dl className="flex flex-col gap-1 text-xs text-subtle">
              <Row k="Session" v={order.stripe.checkoutSessionId ?? "—"} />
              <Row k="Paiement" v={order.stripe.paymentIntentId ?? "—"} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-extrabold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  );
}
