import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { Avatar, ButtonLink, Card, Field, Input, PageHeader, Pill, Select, Switch, Thumb } from "@/components/admin/ui";
import { addOrderNoteAction, createBoxtalLabelAction, sendToMakeAction, setTrackingAction, syncBoxtalAction, transitionOrderAction } from "@/lib/admin/actions/orders";
import { makeConfigured } from "@/lib/make/tiime";
import { boxtalConfigured } from "@/lib/boxtal/client";
import { carrierOf, findOffer } from "@/lib/boxtal/offers";
import { parcelWeightKg } from "@/lib/boxtal/shipment";
import { ADMIN_STATUS_LABELS, STATUS_TONE, TO_SHIP, dateTime, longDate } from "@/lib/admin/order-ui";
import { getOrder, listOrdersForEmail } from "@/lib/db/orders";
import { getProductsBySlugs } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import { canTransition } from "@/lib/domain/order-state";
import { OrderStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Fiche commande, d'après la maquette : en-tête avec statut et actions, articles et
 * totaux, carte sombre d'expédition (suivi + notification client), historique avec
 * notes internes ; à droite, le client et l'encart précommande.
 */
export default async function OrderDetail({ params }: PageProps<"/admin/commandes/[id]">) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const [settings, sameEmail, products] = await Promise.all([getSettings(), listOrdersForEmail(order.email), getProductsBySlugs(order.lines.map((l) => l.productSlug))]);
  const nextStatuses = OrderStatus.options.filter((s) => canTransition(order.status, s));
  const a = order.shippingAddress;
  const b = order.billingAddress;
  const toShip = TO_SHIP.includes(order.status);
  const hasPreorder = order.lines.some((l) => l.preorder);
  const shipFrom = settings.shipping.preorderShipFrom ? new Date(settings.shipping.preorderShipFrom).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const boxtalOn = boxtalConfigured();
  const rate = settings.shipping.rates.find((r) => r.id === order.delivery?.rateId);
  const offerCode = order.delivery?.offerCode || rate?.boxtalOfferCode || "";
  const offer = findOffer(offerCode);
  const books = order.lines.reduce((s, l) => s + l.qty, 0);
  const parcel = settings.shipping.parcel;
  const stripeUrl = order.stripe.paymentIntentId ? `https://dashboard.stripe.com/${order.livemode ? "" : "test/"}payments/${order.stripe.paymentIntentId}` : null;
  const refundable = stripeUrl && !["refunded", "cancelled", "pending_payment"].includes(order.status);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/commandes", label: "Commandes" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Commande {order.number}
            <Pill tone={STATUS_TONE[order.status]}>{ADMIN_STATUS_LABELS[order.status]}</Pill>
            {!order.livemode && <Pill tone="muted">Test</Pill>}
          </span>
        }
        subtitle={`${longDate(order.createdAt)} · payée par carte · ${a.name}`}
        actions={
          <>
            {refundable && (
              <ButtonLink href={stripeUrl} target="_blank" rel="noreferrer" tone="secondary">
                Rembourser dans Stripe ↗
              </ButtonLink>
            )}
            {order.invoice?.number && (
              <ButtonLink href={`/api/factures/${order.id}`} target="_blank" tone="secondary">
                Facture PDF
              </ButtonLink>
            )}
            <ButtonLink href={`mailto:${order.email}?subject=${encodeURIComponent(`Votre commande ${order.number} - Mon Vrai`)}`} tone="secondary">
              Envoyer un e-mail
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          <Card title="Articles">
            {order.lines.map((l, i) => {
              const p = products.get(l.productSlug);
              return (
                <div key={`${l.productSlug}-${i}`} className="grid grid-cols-[52px_1fr_auto_auto] items-center gap-3.5 text-[0.8125rem]">
                  <Thumb src={l.image?.url ?? p?.images[0]?.url} tint={p?.tint ?? "sand"} size={52} />
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/admin/produits/${l.productSlug}`} className="truncate font-bold hover:underline">
                      {l.title}
                    </Link>
                    <span className="text-xs text-subtle">
                      {formatEuro(l.unitPrice)} l'unité
                      {p && p.stock !== null && ` · stock restant ${p.stock}`}
                      {l.preorder && " · précommande"}
                    </span>
                  </div>
                  <span className="text-muted">× {l.qty}</span>
                  <span className="font-extrabold whitespace-nowrap">{formatEuro(l.unitPrice * l.qty)}</span>
                </div>
              );
            })}
            <div className="flex flex-col gap-2 border-t border-line-soft pt-3.5 text-[0.8125rem] font-semibold">
              <Row k="Sous-total" v={formatEuro(order.totals.subtotal)} />
              <Row k={`Livraison${order.tracking ? ` · ${order.tracking.carrier}` : ""}`} v={order.totals.shipping ? formatEuro(order.totals.shipping) : "Offerte"} />
              {order.totals.discount > 0 && <Row k="Remise" v={`−${formatEuro(order.totals.discount)}`} />}
              {order.totals.tax > 0 && <Row k="dont TVA" v={formatEuro(order.totals.tax)} />}
              <div className="flex justify-between border-t border-line-soft pt-2.5 text-[0.9375rem] font-extrabold">
                <span>Total TTC</span>
                <span>{formatEuro(order.totals.total)}</span>
              </div>
            </div>
          </Card>

          <Card
            tone="dark"
            title={boxtalOn ? "Expédition via Boxtal" : "Expédition"}
            aside={
              boxtalOn ? (
                <span className="rounded-pill bg-tint-green-ink px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-green">Connecté</span>
              ) : (
                <span className="rounded-pill bg-tint-sand-ink px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-sand">Manuel</span>
              )
            }
          >
            {boxtalOn && <span className="-mt-2 text-xs text-[#bbb]">Étiquette, suivi et notification client en un clic</span>}

            {order.delivery && (
              <div className="flex flex-col gap-1 rounded-[14px] bg-ink-soft p-3.5 text-[0.8125rem]">
                <span className="text-[0.6875rem] font-bold text-[#bbb]">Choix du client</span>
                <span className="font-bold">
                  {order.delivery.rateName}
                  {offerCode && <span className="font-medium text-[#bbb]"> · {offer?.label ?? offerCode}</span>}
                </span>
                {order.delivery.relay && (
                  <span className="text-xs text-[#ddd]">
                    Point relais : {order.delivery.relay.name} · {[order.delivery.relay.street, `${order.delivery.relay.postalCode} ${order.delivery.relay.city}`].filter(Boolean).join(", ")} (code {order.delivery.relay.code})
                  </span>
                )}
              </div>
            )}

            {order.boxtal ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-[0.8125rem]">
                  <div className="flex flex-col gap-1 rounded-[14px] bg-ink-soft p-3.5">
                    <span className="text-[0.6875rem] font-bold text-[#bbb]">Transporteur</span>
                    <span className="font-bold">{order.tracking?.carrier ?? carrierOf(offerCode)}</span>
                    <span className="text-xs text-[#bbb]">réf. Boxtal {order.boxtal.orderId} · {order.boxtal.status}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-[14px] bg-ink-soft p-3.5">
                    <span className="text-[0.6875rem] font-bold text-[#bbb]">N° de suivi</span>
                    <span className="truncate font-bold">{order.boxtal.trackingNumber ?? order.tracking?.number ?? "en attente…"}</span>
                    {order.boxtal.trackingStatus && (
                      <span className="text-xs text-[#bbb]">
                        {order.boxtal.trackingStatus}
                        {order.boxtal.trackingMessage && ` · ${order.boxtal.trackingMessage}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {order.boxtal.labelPath ? (
                    <ButtonLink href={`/api/etiquettes/${order.id}`} target="_blank" tone="outline" className="text-white">
                      Télécharger l'étiquette
                    </ButtonLink>
                  ) : (
                    <span className="text-xs text-[#bbb]">Étiquette en cours de génération chez Boxtal…</span>
                  )}
                  {(order.boxtal.trackingUrl || order.tracking?.url) && (
                    <ButtonLink href={order.boxtal.trackingUrl ?? order.tracking?.url ?? "#"} target="_blank" rel="noreferrer" tone="outline" className="text-white">
                      Suivre le colis ↗
                    </ButtonLink>
                  )}
                  <ActionForm action={syncBoxtalAction} submitLabel="Actualiser" submitTone="secondary" className="!gap-0 [&>div:last-child]:contents">
                    <input type="hidden" name="id" value={order.id} />
                  </ActionForm>
                </div>
              </>
            ) : toShip ? (
              <>
                {boxtalOn && offerCode && (
                  <ActionForm action={createBoxtalLabelAction} submitLabel="Créer l'étiquette et expédier" submitTone="secondary" footerNote={<span className="text-[#bbb]">Le client sera notifié par e-mail dès que le transporteur prend le colis.</span>}>
                    <input type="hidden" name="id" value={order.id} />
                    <span className="text-xs font-bold text-[#bbb]">
                      1 colis · {parcel.lengthCm}×{parcel.widthCm}×{parcel.heightCm} cm · {Math.round(parcelWeightKg(order, settings) * 1000)} g ({books} livre{books > 1 ? "s" : ""}) · {offer?.label ?? offerCode}
                    </span>
                    {!a.phone && <span className="text-xs font-semibold text-tint-sand">Le transporteur exige un téléphone : ajoutez-le au client avant de créer l'étiquette.</span>}
                  </ActionForm>
                )}
                {boxtalOn && !offerCode && <p className="text-[0.8125rem] text-[#bbb]">Aucune offre Boxtal n'est associée à ce mode de livraison (Paramètres → Livraison). Saisissez le suivi à la main ci-dessous.</p>}
                <div className="flex flex-wrap items-center gap-2 border-t border-[#333] pt-3">
                  <ButtonLink href={`/api/etiquettes/${order.id}/csv`} tone="outline" className="text-white">
                    Télécharger le CSV Boxtal
                  </ButtonLink>
                  <span className="text-[0.6875rem] text-[#bbb]">En cas d'échec (paiement…), importez ce fichier dans Boxtal, puis saisissez le suivi ci-dessous.</span>
                </div>
                <details className={`group ${boxtalOn && offerCode ? "border-t border-[#333] pt-3" : ""}`}>
                  <summary className="cursor-pointer text-xs font-bold text-[#bbb] group-open:mb-3">{boxtalOn && offerCode ? "Ou saisir un suivi à la main" : "Saisir le suivi"}</summary>
                  <ActionForm action={setTrackingAction} submitLabel="Enregistrer le suivi et expédier" submitTone="secondary" footerNote={<span className="text-[#bbb]">Le client sera notifié par e-mail avec le numéro de suivi.</span>}>
                    <input type="hidden" name="id" value={order.id} />
                    <div className="grid grid-cols-2 gap-3 max-[749px]:grid-cols-1 [&_input]:bg-ink-soft [&_input]:text-white [&_select]:bg-ink-soft [&_select]:text-white [&_label>span:first-child]:text-[#bbb]">
                      <Field label="Transporteur" name="carrier">
                        <Select name="carrier" defaultValue={carrierOf(offerCode) || "Colissimo"}>
                          <option>Mondial Relay</option>
                          <option>Colissimo</option>
                          <option>Chronopost</option>
                          <option>La Poste</option>
                          <option>Autre</option>
                        </Select>
                      </Field>
                      <Field label="Numéro de suivi" name="number">
                        <Input name="number" required placeholder="Ex. 6A12345678901" />
                      </Field>
                      <Field label="Lien de suivi (facultatif)" name="url" className="col-span-2 max-[749px]:col-span-1">
                        <Input name="url" type="url" placeholder="https://…" />
                      </Field>
                    </div>
                    <Switch name="notify" label="Prévenir le client par e-mail" defaultChecked className="[&>span:last-child]:bg-[#444] [&>span:last-child]:peer-checked:bg-tint-green [&>span:last-child]:after:bg-white" />
                  </ActionForm>
                </details>
              </>
            ) : order.tracking ? (
              <div className="grid grid-cols-2 gap-3 text-[0.8125rem]">
                <div className="flex flex-col gap-1 rounded-[14px] bg-ink-soft p-3.5">
                  <span className="text-[0.6875rem] font-bold text-[#bbb]">Transporteur</span>
                  <span className="font-bold">{order.tracking.carrier}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[14px] bg-ink-soft p-3.5">
                  <span className="text-[0.6875rem] font-bold text-[#bbb]">N° de suivi</span>
                  <span className="truncate font-bold">{order.tracking.number}</span>
                </div>
              </div>
            ) : (
              <p className="text-[0.8125rem] text-[#bbb]">Rien à expédier pour une commande {ADMIN_STATUS_LABELS[order.status].toLowerCase()}.</p>
            )}
          </Card>

          <Card title="Historique">
            {order.timeline.map((t, i) => (
              <div key={i} className="grid grid-cols-[12px_1fr_auto] items-baseline gap-3.5 text-[0.8125rem]">
                <span className="relative top-px h-2.5 w-2.5 rounded-pill bg-ink" aria-hidden="true" />
                <span className="font-semibold">
                  {t.note && t.status === (order.timeline[i - 1]?.status ?? t.status) && i > 0 ? t.note : <>{ADMIN_STATUS_LABELS[t.status]}{t.note && <span className="font-medium text-muted"> · {t.note}</span>}</>}
                  {t.by && <span className="text-xs font-medium text-subtle"> · {t.by}</span>}
                </span>
                <span className="text-xs text-subtle">{dateTime(t.at)}</span>
              </div>
            ))}
            <ActionForm action={addOrderNoteAction} submitLabel="Ajouter" submitTone="secondary" className="!gap-2 rounded-pill bg-paper p-1.5 pl-4 [&>div:last-child]:contents" hideFooter={false}>
              <input type="hidden" name="id" value={order.id} />
              <input name="note" placeholder="Ajouter une note interne…" required maxLength={500} className="flex-1 bg-transparent text-[0.8125rem] font-medium outline-none placeholder:text-faint" />
            </ActionForm>
          </Card>

          {nextStatuses.length > 0 && (
            <Card title="Changer le statut">
              <ActionForm action={transitionOrderAction} submitLabel="Appliquer" confirm="Confirmer le changement de statut ?">
                <input type="hidden" name="id" value={order.id} />
                <div className="grid grid-cols-2 gap-3 max-[749px]:grid-cols-1">
                  <Field label="Nouveau statut">
                    <Select name="to" defaultValue={nextStatuses[0]}>
                      {nextStatuses.map((s) => (
                        <option key={s} value={s}>
                          {ADMIN_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Note" hint="Visible dans l'historique uniquement.">
                    <Input name="note" />
                  </Field>
                </div>
                {nextStatuses.includes("refunded") && <p className="text-xs text-muted">Le remboursement effectif se fait dans Stripe (bouton en haut) ; ce statut ne déclenche pas de virement.</p>}
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Card
            title="Client"
            aside={
              order.customerUid ? (
                <Link href="/admin/clients" className="border-b-[1.5px] border-ink text-xs font-bold">
                  Voir la fiche
                </Link>
              ) : (
                <span className="text-xs font-semibold text-subtle">Sans compte</span>
              )
            }
          >
            <div className="flex items-center gap-3">
              <Avatar name={a.name} className="h-10 w-10 text-[0.8125rem]" />
              <div className="flex min-w-0 flex-col text-[0.8125rem]">
                <span className="font-bold">{a.name}</span>
                <span className="truncate text-xs text-subtle">
                  {order.email} · {sameEmail.length} commande{sameEmail.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <Block label="Adresse de livraison">
              {a.name}
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
              {a.country !== "FR" && ` · ${a.country}`}
              {a.phone && (
                <>
                  <br />
                  {a.phone}
                </>
              )}
            </Block>
            <Block label="Facturation">
              {b ? (
                <>
                  {b.name}
                  <br />
                  {b.line1}
                  <br />
                  {b.postalCode} {b.city}
                </>
              ) : (
                "Identique à la livraison"
              )}
            </Block>
            <Block label="Facture Tiime">
              {order.invoice ? (
                <a href={`/api/factures/${order.id}`} target="_blank" className="underline">
                  {order.invoice.number} (PDF)
                </a>
              ) : ["pending_payment", "cancelled"].includes(order.status) ? (
                "Pas de facture pour une commande non payée"
              ) : (
                "Facturée dans Tiime au paiement. PDF absent : utilisez « Refacturer dans Tiime » ci-dessous."
              )}
            </Block>
          </Card>

          {hasPreorder && (
            <Card tone="green" title={<span className="text-sm text-ink">Précommande</span>} className="!gap-1.5 !py-5">
              <span className="text-[0.8125rem] font-semibold">
                {shipFrom ? `Expédition prévue à partir du ${shipFrom}.` : "Expédition dès réception du stock."} Le client a été prévenu à la commande.
              </span>
            </Card>
          )}

          {makeConfigured() && !["pending_payment", "cancelled"].includes(order.status) && (
            <Card title={<span className="text-sm">Tiime (via Make)</span>} className="!gap-2">
              {order.tiime?.invoiceId ? (
                <p className="text-xs text-subtle">
                  Facture Tiime <strong className="text-ink">{order.tiime.invoiceId}</strong>
                  {order.tiime.clientId && ` · client ${order.tiime.clientId}`} · {new Date(order.tiime.at).toLocaleDateString("fr-FR")}
                </p>
              ) : (
                <p className="text-xs text-subtle">Pas encore facturée dans Tiime.</p>
              )}
              <ActionForm
                action={sendToMakeAction}
                submitLabel={order.tiime?.invoiceId ? "Refacturer dans Tiime" : "Facturer dans Tiime"}
                submitTone="secondary"
                confirm={order.tiime?.invoiceId ? "Une facture Tiime existe déjà pour cette commande : en créer une seconde ?" : undefined}
                className="!gap-0 [&>div:last-child]:justify-start"
              >
                <input type="hidden" name="id" value={order.id} />
              </ActionForm>
            </Card>
          )}

          <Card title={<span className="text-sm">Stripe</span>} className="!gap-1.5">
            <dl className="flex flex-col gap-1 text-xs text-subtle">
              <Row k="Session" v={order.stripe.checkoutSessionId ?? "-"} />
              <Row k="Paiement" v={order.stripe.paymentIntentId ?? "-"} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="truncate">{v}</span>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line-soft pt-3 text-[0.8125rem] font-semibold leading-relaxed">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">{label}</span>
      <div>{children}</div>
    </div>
  );
}
