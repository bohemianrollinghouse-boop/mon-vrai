import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PromoForm, QtyControls } from "@/components/site/CartLineControls";
import { CompleteCollectionButton } from "@/components/site/CompleteCollectionButton";
import { PillLink, TINT_BG } from "@/components/site/ui";
import { addToCartForm } from "@/lib/cart/actions";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { buildQuote } from "@/lib/checkout/quote";
import { formatEuro, formatEuroShort } from "@/lib/domain/money";
import { collectionState, toCollectionTitles } from "@/lib/promos/collection";
import { productPath, systemPath } from "@/lib/domain/system-pages";

export const metadata: Metadata = { title: "Votre panier" };
export const dynamic = "force-dynamic";

/*
 * Page panier (maquette 5a) : lignes à gauche avec quantités, suggestions pour
 * compléter la collection, récapitulatif collant à droite, réassurance. Tous les
 * chiffres viennent de loadCart(), la même source que l'en-tête et le paiement.
 */
export default async function CartPage() {
  const [{ quote, view }, all, settings] = await Promise.all([buildQuote("live"), listPublishedProducts(), getSettings()]);
  const gifts = quote.lines.filter((l) => l.gift);
  const inCart = new Set(view.lines.map((l) => l.product.slug));
  const upsell = all.filter((p) => !inCart.has(p.slug)).slice(0, 4);
  const shipFrom = settings.shipping.preorderShipFrom ? formatDate(settings.shipping.preorderShipFrom) : null;
  // Bloc « Compléter la collection » : conditionné au réglage admin de l'offre collection.
  const collection = collectionState(toCollectionTitles(all), inCart, settings.promos.collectionOffer.enabled);
  const showComplete = collection.enabled && collection.missing.length > 0;

  return (
    <section className="site-wrap py-6 pb-[4.5rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <h1 className="display-1 text-[clamp(1.875rem,4vw,2.75rem)]">Votre panier</h1>
        <Link href={systemPath("catalogue")} className="border-b-2 border-ink pb-0.5 text-[0.8125rem] font-bold">
          Continuer mes achats
        </Link>
      </div>

      {view.lines.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-panel bg-white px-8 py-16 text-center">
          <h2 className="display-2">Votre panier est vide</h2>
          <p className="max-w-[460px] leading-relaxed text-[#555]">Neuf imagiers réalistes pour les 6-18 mois vous attendent.</p>
          <PillLink href={systemPath("catalogue")} variant="dark">
            Voir les imagiers
          </PillLink>
        </div>
      ) : (
        <>
          {view.shipping.enabled && (
            <div className="mt-6 flex flex-col gap-3 rounded-[20px] bg-tint-green px-6 py-[1.125rem]">
              <div className="flex justify-between gap-4 text-[0.8125rem] font-bold text-tint-green-ink">
                <span>
                  {view.shipping.reached ? "Livraison offerte débloquée" : `Plus que ${formatEuro(view.shipping.remaining)} pour la livraison offerte`}
                </span>
                <span>
                  {formatEuro(view.subtotal)} / {formatEuro(settings.shipping.freeThreshold)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-pill bg-white" role="progressbar" aria-valuenow={view.shipping.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-pill bg-ink" style={{ width: `${view.shipping.percent}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-[1.6fr_1fr] items-start gap-5 max-[989px]:grid-cols-1">
            <div className="flex flex-col gap-3">
              {view.lines.map((l) => {
                const img = l.product.images[0];
                return (
                  <div key={l.product.slug} className="grid grid-cols-[120px_1fr_auto] items-center gap-6 rounded-card bg-white p-5 max-[599px]:grid-cols-[84px_1fr] max-[599px]:gap-4">
                    <div className={`relative aspect-square min-h-0 rounded-thumb ${TINT_BG[l.product.tint]}`}>
                      {img && (
                        <div className="absolute inset-2.5 overflow-hidden rounded-[10px]">
                          <Image src={img.url} alt={img.alt || l.product.title} fill sizes="120px" className="object-cover" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">
                        {l.product.ageLabel}
                        {l.product.preorder.enabled && " · Précommande"}
                      </span>
                      <Link href={productPath(l.product.slug)} className="text-lg font-bold tracking-[-0.01em]">
                        {l.product.title}
                      </Link>
                      {l.product.preorder.enabled && shipFrom && <span className="text-[0.8125rem] text-muted">Expédition à partir du {shipFrom}</span>}
                      <div className="mt-1.5">
                        <QtyControls slug={l.product.slug} qty={l.qty} />
                      </div>
                    </div>
                    <span className="self-start whitespace-nowrap text-lg font-extrabold max-[599px]:col-start-2">{formatEuro(l.lineTotal)}</span>
                  </div>
                );
              })}

              {showComplete && (
                <div className="mt-3 flex flex-col gap-4 rounded-card bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-extrabold">Compléter la collection</span>
                      <span className="text-[0.8125rem] font-semibold text-tint-sand-ink">
                        Ajoutez {collection.missing.length === 1 ? "le titre manquant" : `les ${collection.missing.length} titres manquants`} · un livre offert, la collection à {formatEuroShort(collection.offerPrice)}{" "}
                        <span className="line-through opacity-60">{formatEuroShort(collection.fullPrice)}</span>
                      </span>
                    </div>
                    <CompleteCollectionButton missingCost={collection.missingCost} />
                  </div>
                  <div className="grid grid-cols-4 gap-3 max-[989px]:grid-cols-2">
                    {upsell.map((p) => {
                      const img = p.images[0];
                      return (
                        <div key={p.slug} className="flex flex-col items-center gap-2.5 text-center">
                          <Link href={productPath(p.slug)} className={`relative block aspect-square w-full min-h-0 rounded-thumb ${TINT_BG[p.tint]}`}>
                            {img && (
                              <div className="absolute inset-2 overflow-hidden rounded-[10px]">
                                <Image src={img.url} alt={img.alt || p.title} fill sizes="(min-width:990px) 150px, 45vw" className="object-cover" />
                              </div>
                            )}
                          </Link>
                          <span className="text-[0.8125rem] font-bold leading-snug">{p.title}</span>
                          <form action={addToCartForm} className="mt-auto w-full">
                            <input type="hidden" name="slug" value={p.slug} />
                            <input type="hidden" name="qty" value="1" />
                            <button type="submit" className="w-full rounded-pill bg-paper px-3.5 py-2.5 text-xs font-bold">
                              + Ajouter · {formatEuroShort(p.price)}
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <aside className="sticky top-24 flex flex-col gap-3 max-[989px]:static">
              <div className="flex flex-col gap-[1.125rem] rounded-card bg-white p-7">
                <span className="text-lg font-extrabold tracking-[-0.01em]">Récapitulatif</span>
                <div className="flex flex-col gap-2.5 text-sm font-semibold">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted">
                      Sous-total · {view.count} {view.count > 1 ? "livres" : "livre"}
                    </span>
                    <span>{formatEuro(view.subtotal)}</span>
                  </div>
                  {quote.applied
                    .filter((a) => a.amount > 0)
                    .map((a) => (
                      <div key={a.code} className="flex justify-between gap-4 text-tint-green-ink">
                        <span>
                          Code {a.code} · {a.label}
                        </span>
                        <span>−{formatEuro(a.amount)}</span>
                      </div>
                    ))}
                  {gifts.map((g) => (
                    <div key={g.slug} className="flex justify-between gap-4 text-tint-green-ink">
                      <span>Offert · {g.title}</span>
                      <span>0,00 €</span>
                    </div>
                  ))}
                  {quote.collectionDiscount > 0 && (
                    <div className="flex justify-between gap-4 text-tint-green-ink">
                      <span>{quote.collectionLabel}</span>
                      <span>−{formatEuro(quote.collectionDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-muted">Livraison</span>
                    <span className={quote.freeShipping ? "text-tint-green-ink" : ""}>{quote.freeShipping || (view.shipping.enabled && view.shipping.reached) ? "Offerte" : "Calculée au paiement"}</span>
                  </div>
                  <PromoForm applied={quote.applied.map((a) => ({ code: a.code, label: a.label, viaLink: a.viaLink }))} errors={quote.rejected} />
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
                  <span className="text-[0.9375rem] font-bold">Total</span>
                  <span className="whitespace-nowrap text-[1.75rem] font-extrabold tracking-[-0.02em]">{formatEuro(Math.max(0, view.subtotal - quote.discount))}</span>
                </div>
                <span className="text-xs leading-relaxed text-subtle">
                  Taxes incluses. Livraison calculée à l'étape suivante selon la destination et le transporteur.
                </span>
                <PillLink href="/commande" variant="dark" className="w-full justify-center py-[1.125rem] text-sm">
                  Passer la commande
                </PillLink>
                {settings.payments.mode === "test" && (
                  <span className="rounded-[14px] bg-tint-sand px-4 py-3 text-center text-xs font-bold text-tint-sand-ink">
                    Paiement en mode test — aucun débit réel. Carte de test : 4242 4242 4242 4242.
                  </span>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  {["Apple Pay", "PayPal", "CB"].map((p) => (
                    <span key={p} className="rounded-pill bg-paper px-3 py-2 text-[0.6875rem] font-bold">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-card bg-tint-sand p-6 text-[0.8125rem] font-semibold leading-relaxed text-tint-sand-ink">
                {shipFrom && <span>Précommande — expédition dès le {shipFrom}, tous vos livres dans un seul colis.</span>}
                <span>Mondial Relay, Colissimo ou Chronopost · {settings.shipping.countries.map(countryName).join(", ")}.</span>
                <span>14 jours pour changer d'avis.</span>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function countryName(code: string): string {
  return ({ FR: "France", BE: "Belgique", LU: "Luxembourg" } as Record<string, string>)[code] ?? code;
}
