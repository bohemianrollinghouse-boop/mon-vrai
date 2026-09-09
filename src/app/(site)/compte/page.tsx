import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccountForm } from "@/components/site/AccountForm";
import { OrderProgress } from "@/components/site/OrderProgress";
import { PillLink } from "@/components/site/ui";
import { addAddressAction, deleteAccountAction, deleteAddressAction, setNewsletterAction, updateProfileAction } from "@/lib/account/actions";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getCustomer } from "@/lib/db/customers";
import { listOrdersForUser } from "@/lib/db/orders";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { formatEuroShort } from "@/lib/domain/money";
import { ORDER_STATUS_LABELS } from "@/lib/domain/order-state";
import { systemPath } from "@/lib/domain/system-pages";
import type { Order } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

/*
 * Espace client (maquette 7b) : « Bonjour Camille », menu à gauche (commandes,
 * adresses, informations, newsletter), et à droite la commande en cours avec ses
 * quatre étapes, les commandes précédentes, l'invitation à compléter la collection.
 */

const TABS = [
  { key: "commandes", label: "Mes commandes" },
  { key: "adresses", label: "Mes adresses" },
  { key: "informations", label: "Mes informations" },
  { key: "newsletter", label: "Newsletter" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const ACTIVE: Order["status"][] = ["paid", "preparing", "shipped"];

export default async function AccountPage({ searchParams }: PageProps<"/compte">) {
  const { onglet } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === onglet) ? (onglet as Tab) : "commandes";
  const user = await requireUser();
  const [orders, customer, products, settings] = await Promise.all([listOrdersForUser(user.uid, user.email), getCustomer(user.uid), listPublishedProducts(), getSettings()]);
  const firstName = (customer?.name || user.name || "").split(" ")[0];
  const current = orders.find((o) => ACTIVE.includes(o.status));
  const previous = orders.filter((o) => o !== current);
  const owned = new Set(orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded").flatMap((o) => o.lines.map((l) => l.productSlug)));
  const missing = products.filter((p) => !owned.has(p.slug)).length;

  return (
    <section className="site-wrap flex flex-col gap-6 py-6 pb-[4.5rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-[clamp(2rem,3.5vw,2.75rem)] font-extrabold leading-[1.04] tracking-[-0.02em]">Bonjour {firstName || "vous"}</h1>
        <div className="flex items-center gap-4">
          {user.isAdmin && (
            <Link href="/admin" className="text-[0.8125rem] font-semibold text-subtle underline">
              Administration
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="border-b border-[#ccc] text-[0.8125rem] font-semibold text-subtle hover:text-ink">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] items-start gap-5 max-[899px]:grid-cols-1">
        <nav className="flex flex-col gap-1 rounded-card bg-white p-3 text-sm font-semibold max-[899px]:flex-row max-[899px]:flex-wrap" aria-label="Mon compte">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === "commandes" ? "/compte" : `/compte?onglet=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={`rounded-thumb px-[1.125rem] py-3.5 ${tab === t.key ? "bg-ink text-white" : "hover:bg-paper"}`}>
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-4">
          {tab === "commandes" && (
            <>
              {current ? (
                <>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-6 rounded-card bg-tint-green p-7 max-[599px]:grid-cols-1">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-tint-green-ink">{current.lines.some((l) => l.preorder) ? "Précommande en cours" : "Commande en cours"}</span>
                      <span className="text-xl font-extrabold tracking-[-0.01em]">
                        Commande {current.number} · {count(current)} imagier{count(current) > 1 ? "s" : ""} · {formatEuroShort(current.totals.total)}
                      </span>
                      <span className="text-sm font-semibold text-tint-green-ink">{shippingLine(current, settings.shipping.preorderShipFrom)}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {current.lines.slice(0, 4).map((l, i) => l.image && <Image key={i} src={l.image.url} alt="" width={64} height={64} className="h-16 w-16 rounded-md object-cover shadow-[0_8px_18px_rgb(0_0_0/0.12)]" />)}
                    </div>
                  </div>
                  <OrderProgress order={current} preorderShipFrom={settings.shipping.preorderShipFrom} />
                </>
              ) : (
                <div className="flex flex-col items-start gap-4 rounded-card bg-white p-7">
                  <span className="text-base font-extrabold">Aucune commande en cours</span>
                  <p className="text-sm text-muted">Vos prochaines commandes et leur suivi apparaîtront ici.</p>
                  <PillLink href={systemPath("catalogue")} variant="dark" size="sm">
                    Voir les imagiers
                  </PillLink>
                </div>
              )}

              {previous.length > 0 && (
                <>
                  <div className="flex items-baseline justify-between pt-2">
                    <span className="text-base font-extrabold">Commandes précédentes</span>
                    <span className="text-[0.8125rem] font-semibold text-subtle">
                      {previous.length} commande{previous.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {previous.map((o) => (
                    <Link key={o.id} href={`/compte/commandes/${o.id}`} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-6 rounded-card bg-white px-7 py-5 text-sm font-semibold hover:opacity-80 max-[599px]:grid-cols-[auto_1fr]">
                      {o.lines[0]?.image ? <Image src={o.lines[0].image.url} alt="" width={44} height={44} className="h-11 w-11 rounded object-cover shadow-[0_6px_14px_rgb(0_0_0/0.12)]" /> : <span className="h-11 w-11 rounded bg-paper" />}
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span>
                          Commande {o.number} · {count(o)} imagier{count(o) > 1 ? "s" : ""}
                        </span>
                        <span className="truncate text-xs text-subtle">
                          {o.lines.map((l) => l.title).join(", ")} · {date(o.createdAt)}
                        </span>
                      </span>
                      <span className={`rounded-pill px-3 py-1.5 text-xs font-bold ${o.status === "delivered" ? "bg-tint-green text-tint-green-ink" : "bg-paper"}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                      <span className="font-extrabold">{formatEuroShort(o.totals.total)}</span>
                    </Link>
                  ))}
                </>
              )}

              {missing > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-5 rounded-card bg-tint-sand px-7 py-6">
                  <span className="text-sm font-semibold text-tint-sand-ink">
                    Il vous manque {missing} imagier{missing > 1 ? "s" : ""} pour compléter la collection.
                  </span>
                  <PillLink href={systemPath("catalogue")} variant="dark" size="sm" className="shrink-0">
                    Voir le catalogue
                  </PillLink>
                </div>
              )}
            </>
          )}

          {tab === "adresses" && (
            <>
              <div className="flex flex-col gap-3">
                {(customer?.addresses ?? []).length === 0 && <p className="rounded-card bg-white p-7 text-sm text-muted">Aucune adresse enregistrée. Vos adresses de livraison s'ajoutent ici à chaque commande.</p>}
                {(customer?.addresses ?? []).map((a, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-white px-7 py-5 text-sm">
                    <span className="font-semibold leading-relaxed">
                      {a.name}
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}
                      <br />
                      {a.postalCode} {a.city}
                      {a.country !== "FR" ? ` · ${a.country}` : ""}
                      {a.phone ? ` · ${a.phone}` : ""}
                    </span>
                    <AccountForm action={deleteAddressAction} submitLabel="Supprimer" variant="light" confirm="Supprimer cette adresse ?" className="!gap-0">
                      <input type="hidden" name="index" value={i} />
                    </AccountForm>
                  </div>
                ))}
              </div>
              <div className="rounded-card bg-white p-7">
                <h2 className="mb-4 text-base font-extrabold">Ajouter une adresse</h2>
                <AccountForm action={addAddressAction} submitLabel="Enregistrer l'adresse">
                  <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
                    <Field label="Nom complet" name="name" className="col-span-2 max-[599px]:col-span-1" />
                    <Field label="Adresse" name="line1" className="col-span-2 max-[599px]:col-span-1" />
                    <Field label="Complément" name="line2" required={false} />
                    <Field label="Téléphone" name="phone" required={false} />
                    <Field label="Code postal" name="postalCode" />
                    <Field label="Ville" name="city" />
                    <label className="flex flex-col gap-2 text-[0.8125rem] font-bold">
                      <span>Pays</span>
                      <select name="country" defaultValue="FR" className="rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold outline-none">
                        {settings.shipping.countries.map((c) => (
                          <option key={c} value={c}>
                            {countryName(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </AccountForm>
              </div>
            </>
          )}

          {tab === "informations" && (
            <>
              <div className="rounded-card bg-white p-7">
                <h2 className="mb-4 text-base font-extrabold">Mes informations</h2>
                <AccountForm action={updateProfileAction} submitLabel="Enregistrer">
                  <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
                    <Field label="Prénom" name="firstName" defaultValue={firstName} />
                    <Field label="Nom" name="lastName" defaultValue={(customer?.name || user.name || "").split(" ").slice(1).join(" ")} required={false} />
                    <label className="col-span-2 flex flex-col gap-2 text-[0.8125rem] font-bold max-[599px]:col-span-1">
                      <span>E-mail</span>
                      <input value={user.email} readOnly className="rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold text-muted outline-none" />
                      <span className="text-xs font-medium text-subtle">L'adresse de connexion ne se modifie pas ici ; écrivez-nous si besoin.</span>
                    </label>
                  </div>
                </AccountForm>
              </div>
              <div className="rounded-card bg-white p-7">
                <h2 className="mb-1 text-base font-extrabold">Supprimer mon compte</h2>
                <p className="mb-4 text-sm text-muted">Votre fiche et vos adresses sont effacées. Les factures de vos commandes sont conservées le temps légal, détachées de votre compte.</p>
                <AccountForm action={deleteAccountAction} submitLabel="Supprimer définitivement" variant="danger" redirectTo="/" confirm="Supprimer votre compte ? Cette action est irréversible.">
                  <Field label="Tapez SUPPRIMER pour confirmer" name="confirm" placeholder="SUPPRIMER" className="max-w-xs" />
                </AccountForm>
              </div>
            </>
          )}

          {tab === "newsletter" && (
            <div className="rounded-card bg-white p-7">
              <h2 className="mb-1 text-base font-extrabold">Newsletter</h2>
              <p className="mb-4 text-sm text-muted">Nouveaux titres, coulisses de fabrication, idées de lecture. Un e-mail de temps en temps, jamais plus.</p>
              <AccountForm action={setNewsletterAction} submitLabel="Enregistrer">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
                  <input type="checkbox" name="optIn" defaultChecked={customer?.newsletter?.optIn ?? false} className="h-4 w-4 accent-ink" />
                  Je souhaite recevoir la newsletter à {user.email}
                </label>
                {customer?.newsletter && <span className="text-xs text-subtle">Dernier changement : {date(customer.newsletter.at)}.</span>}
              </AccountForm>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, name, defaultValue = "", required = true, placeholder, className = "" }: { label: string; name: string; defaultValue?: string; required?: boolean; placeholder?: string; className?: string }) {
  return (
    <label className={`flex flex-col gap-2 text-[0.8125rem] font-bold ${className}`}>
      <span>{label}</span>
      <input name={name} defaultValue={defaultValue} required={required} placeholder={placeholder} className="rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-2 focus-visible:outline-ink" />
    </label>
  );
}

function count(o: Order): number {
  return o.lines.reduce((n, l) => n + l.qty, 0);
}
function date(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function shippingLine(o: Order, preorderShipFrom?: string): string {
  if (o.status === "shipped") return `Expédiée${o.tracking ? ` · ${o.tracking.carrier} ${o.tracking.number}` : ""}.`;
  if (o.lines.some((l) => l.preorder) && preorderShipFrom) return `Expédition prévue à partir du ${date(new Date(preorderShipFrom).getTime())} — un seul colis.`;
  return "Nous préparons votre colis — un seul envoi pour tous vos livres.";
}
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
