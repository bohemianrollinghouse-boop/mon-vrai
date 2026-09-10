import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, GridTable, Input, Notice, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { saveCostsAction } from "@/lib/admin/actions/settings";
import { COUNTED, capitalize, shortDate } from "@/lib/admin/order-ui";
import { marginPct, orderRevenue, sumRevenue, type OrderRevenue } from "@/lib/admin/revenue";
import { requireAdmin } from "@/lib/auth/session";
import { now as clock } from "@/lib/db/helpers";
import { listOrders } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import { dayKey } from "@/lib/stats/keys";

export const dynamic = "force-dynamic";

/*
 * Revenus : ce qu'il reste vraiment d'une vente. Le tableau de bord affiche le chiffre
 * d'affaires encaissé ; ici on en retire les cotisations URSSAF, la commission du
 * paiement, la fabrication des livres, l'emballage et le port réellement payé chez
 * Boxtal (barème fournisseur, pas le port facturé au client — d'où une marge sur le
 * port, affichée à part). Le calcul vit dans `lib/admin/revenue.ts` ; les taux et coûts
 * unitaires sont saisis en bas de page (action `saveCostsAction`).
 *
 * Mêmes règles de comptage que le tableau de bord : commandes réelles (livemode) et
 * statuts encaissés (COUNTED), donc ni les commandes de test ni les remboursements.
 */

const PERIODS = [
  { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "90 jours", days: 90 },
  { key: "annee", label: "Année en cours", days: null },
  { key: "tout", label: "Depuis le début", days: null },
] as const;

const fmt = (n: number) => n.toLocaleString("fr-FR");
/** 1230 → « 12,3 % ». Les taux sont stockés en points de base. */
const bpLabel = (bp: number) => `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
const pctLabel = (n: number | null, digits = 1) => (n === null ? "–" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`);
/** Un coût s'affiche en négatif : « − 3,69 € ». */
const minus = (cents: number) => (cents === 0 ? formatEuro(0) : `− ${formatEuro(Math.abs(cents))}`);
const monthKey = (ts: number) => dayKey(ts).slice(0, 7);
const monthLabel = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

export default async function RevenusPage({ searchParams }: PageProps<"/admin/revenus">) {
  await requireAdmin();
  const { periode } = await searchParams;
  const period = PERIODS.find((p) => p.key === periode) ?? PERIODS[0];
  const [settings, all] = await Promise.all([getSettings(), listOrders({ limit: 2000 })]);
  const costs = settings.costs;

  const now = clock();
  const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  const from = period.days ? now - period.days * 86_400_000 : period.key === "annee" ? yearStart : 0;

  const counted = all.filter((o) => o.livemode && COUNTED.includes(o.status));
  const rows = counted.filter((o) => o.createdAt >= from).map((o) => orderRevenue(o, settings));
  const t = sumRevenue(rows);
  const margin = marginPct(t);

  // Période précédente de même durée, pour situer le revenu net.
  const previous = period.days ? sumRevenue(counted.filter((o) => o.createdAt >= from - period.days * 86_400_000 && o.createdAt < from).map((o) => orderRevenue(o, settings))) : null;
  const netDelta = previous && previous.net > 0 ? Math.round(((t.net - previous.net) / previous.net) * 100) : null;

  // Décomposition : le CA en haut, chaque coût en dessous, le net en bas. Les barres sont
  // proportionnelles au chiffre d'affaires de la période.
  const breakdown = [
    { label: "Chiffre d'affaires encaissé", note: `${fmt(t.orders)} commande${t.orders > 1 ? "s" : ""} · ${fmt(t.books)} livre${t.books > 1 ? "s" : ""}`, value: t.revenue, bar: "bg-ink", sign: 1 },
    { label: "Cotisations URSSAF", note: `${bpLabel(costs.urssafBp)} du CA encaissé`, value: t.urssaf, bar: "bg-tint-pink-ink", sign: -1 },
    { label: "Commission de paiement", note: `${bpLabel(costs.stripeBp)} + ${formatEuro(costs.stripeFixed)} par commande`, value: t.stripeFee, bar: "bg-tint-blue-ink", sign: -1 },
    { label: "Fabrication des livres", note: costs.bookCost ? `${fmt(t.books)} × ${formatEuro(costs.bookCost)}` : "coût unitaire non renseigné", value: t.bookCost, bar: "bg-tint-sand-ink", sign: -1 },
    { label: "Emballages", note: costs.packagingCost ? `${fmt(t.orders)} colis × ${formatEuro(costs.packagingCost)}` : "coût unitaire non renseigné", value: t.packagingCost, bar: "bg-tint-sand-ink", sign: -1 },
    { label: "Port réel (Boxtal)", note: `${formatEuro(t.shippingCharged)} facturés au client`, value: t.shippingCost, bar: "bg-tint-green-ink", sign: -1 },
  ];
  const barMax = Math.max(1, t.revenue);

  // Marge sur le port, par transporteur : ce qu'on facture face à ce que Boxtal prélève.
  const byRate = new Map<string, { name: string; n: number; charged: number; cost: number }>();
  for (const r of rows) {
    const id = r.order.delivery?.rateId ?? "(sans mode)";
    const e = byRate.get(id) ?? { name: r.order.delivery?.rateName || "Sans mode de livraison", n: 0, charged: 0, cost: 0 };
    e.n += 1;
    e.charged += r.shippingCharged;
    e.cost += r.shippingCost;
    byRate.set(id, e);
  }
  const rates = [...byRate.values()].sort((a, b) => b.n - a.n);

  // Mois par mois, du plus récent au plus ancien.
  const byMonth = new Map<string, OrderRevenue[]>();
  for (const r of rows) {
    const k = monthKey(r.order.createdAt);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, list]) => ({ key, ...sumRevenue(list) }));

  // Un coût unitaire laissé à zéro gonfle le revenu net : on le dit plutôt que de l'ignorer.
  const missing = [!costs.bookCost && "le coût de fabrication d'un livre", !costs.packagingCost && "le coût d'un emballage"].filter((x): x is string => Boolean(x));

  return (
    <>
      <PageHeader
        title="Revenus"
        subtitle="Ce qu'il reste du chiffre d'affaires, une fois retirés les cotisations, les coûts de fabrication et le port réel."
        actions={
          <nav className="flex gap-1.5" aria-label="Période">
            {PERIODS.map((p) => (
              <Link key={p.key} href={p.key === "30" ? "/admin/revenus" : `/admin/revenus?periode=${p.key}`} className={`rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${p.key === period.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      {missing.length > 0 && (
        <Notice tone="info">
          {capitalize(missing.join(" et "))} {missing.length > 1 ? "ne sont pas renseignés" : "n'est pas renseigné"} : le revenu net ci-dessous est donc surévalué. À saisir dans « Paramètres du calcul », en bas de page.
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile label="Chiffre d'affaires" value={formatEuro(t.revenue)} note={`${fmt(t.orders)} commande${t.orders > 1 ? "s" : ""} encaissée${t.orders > 1 ? "s" : ""}`} href="/admin/commandes" />
        <Tile tone="sand" label="Coûts" value={minus(t.costs)} note={t.revenue ? `${pctLabel((t.costs / t.revenue) * 100, 0)} du chiffre d'affaires` : "aucune vente sur la période"} />
        <Tile tone={t.net >= 0 ? "green" : "pink"} label="Revenu net" value={formatEuro(t.net)} note={netDelta === null ? "pas de période de comparaison" : `${netDelta >= 0 ? "+" : "−"}${Math.abs(netDelta)} % vs période préc.`} />
        <Tile tone="dark" label="Marge nette" value={pctLabel(margin)} note={t.orders ? `${formatEuro(Math.round(t.net / t.orders))} par commande` : "–"} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <Card title="Du chiffre d'affaires au revenu net" aside={<span className="text-xs font-bold text-subtle">Période affichée</span>}>
          {t.orders === 0 ? (
            <p className="text-[0.8125rem] text-muted">Aucune commande encaissée sur la période.</p>
          ) : (
            <>
              {breakdown.map((b) => (
                <div key={b.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.8125rem] font-bold">{b.label}</span>
                    <span className="whitespace-nowrap text-[0.8125rem] font-extrabold">{b.sign > 0 ? formatEuro(b.value) : minus(b.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-pill bg-line-soft">
                    <div className={`h-full rounded-pill ${b.bar}`} style={{ width: `${Math.max(b.value > 0 ? 2 : 0, Math.round((b.value / barMax) * 100))}%` }} />
                  </div>
                  <span className="text-xs text-subtle">{b.note}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-3.5">
                <span className="text-[0.9375rem] font-extrabold">Revenu net</span>
                <span className="whitespace-nowrap text-[1.25rem] font-extrabold">{formatEuro(t.net)}</span>
              </div>
              <span className="text-[0.6875rem] leading-relaxed text-subtle">
                Les cotisations et la commission de paiement portent sur l'encaissement complet, port compris. Le port réel vient du barème fournisseur Boxtal (TTC) selon le transporteur, le pays et le poids du colis.
                {t.unknownShipping > 0 && ` ${t.unknownShipping} commande${t.unknownShipping > 1 ? "s" : ""} sans coût Boxtal connu : le port facturé y sert de repli (marge nulle).`}
              </span>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Marge sur le port" aside={<span className="text-xs font-bold text-subtle">Facturé − réel</span>}>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-subtle">Facturé</span>
                <span className="text-base font-extrabold">{formatEuro(t.shippingCharged)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-subtle">Payé à Boxtal</span>
                <span className="text-base font-extrabold">{formatEuro(t.shippingCost)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-subtle">Marge</span>
                <span className={`text-base font-extrabold ${t.shippingMargin < 0 ? "text-danger" : ""}`}>{formatEuro(t.shippingMargin)}</span>
              </div>
            </div>
            {rates.length === 0 ? (
              <p className="text-[0.8125rem] text-muted">Aucune expédition sur la période.</p>
            ) : (
              rates.map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-3 border-t border-line-soft pt-2.5 text-[0.8125rem]">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{r.name}</span>
                    <span className="text-xs text-subtle">
                      {r.n} colis · {formatEuro(r.charged)} facturés · {formatEuro(r.cost)} payés
                    </span>
                  </span>
                  <Pill tone={r.charged - r.cost < 0 ? "pink" : "ok"}>{formatEuro(r.charged - r.cost)}</Pill>
                </div>
              ))
            )}
            <span className="text-[0.6875rem] leading-relaxed text-subtle">Une livraison offerte au client laisse le coût Boxtal à notre charge : la marge y est négative. Les tarifs facturés se règlent dans Livraison.</span>
          </Card>

          <Card tone="green" title="Par livre vendu">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold">Encaissé</span>
                <span className="text-base font-extrabold">{t.books ? formatEuro(Math.round(t.goods / t.books)) : "–"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold">Net</span>
                <span className="text-base font-extrabold">{t.books ? formatEuro(Math.round(t.net / t.books)) : "–"}</span>
              </div>
            </div>
            <span className="text-[0.6875rem] leading-relaxed">« Encaissé » = prix des livres hors port, divisé par le nombre d'exemplaires (cadeaux compris). « Net » répartit le revenu net sur ces mêmes exemplaires.</span>
          </Card>
        </div>
      </div>

      <Card title="Mois par mois" className="!p-6 [&>div:last-child]:-mx-6 [&>div:last-child]:rounded-none [&>div:last-child]:py-0">
        <GridTable
          columns="1fr 90px 110px 110px 110px 110px 90px"
          head={["Mois", "Commandes", "Chiffre d'affaires", "Coûts", "Marge port", "Revenu net", "Marge"]}
          empty="Aucune commande encaissée sur la période."
          rows={months.map((m) => ({
            key: m.key,
            cells: [
              <span key="m" className="font-bold">{capitalize(monthLabel(m.key))}</span>,
              <span key="n" className="font-semibold">{fmt(m.orders)}</span>,
              <span key="ca" className="font-semibold whitespace-nowrap">{formatEuro(m.revenue)}</span>,
              <span key="c" className="text-subtle whitespace-nowrap">{minus(m.costs)}</span>,
              <span key="p" className={`whitespace-nowrap ${m.shippingMargin < 0 ? "text-danger" : "text-subtle"}`}>{formatEuro(m.shippingMargin)}</span>,
              <span key="net" className="font-extrabold whitespace-nowrap">{formatEuro(m.net)}</span>,
              <span key="t" className="font-bold whitespace-nowrap">{pctLabel(marginPct(m), 0)}</span>,
            ],
          }))}
        />
      </Card>

      <Card title="Par commande" aside={<span className="text-xs font-bold text-subtle">{rows.length > 20 ? "20 dernières de la période" : "toute la période"}</span>} className="!p-6 [&>div:last-child]:-mx-6 [&>div:last-child]:rounded-none [&>div:last-child]:py-0">
        <GridTable
          columns="minmax(110px,auto) 70px 1fr 100px 110px 110px 100px"
          head={["N°", "Date", "Livraison", "Chiffre d'affaires", "Port facturé / réel", "Coûts", "Revenu net"]}
          empty="Aucune commande encaissée sur la période."
          rows={rows.slice(0, 20).map((r) => ({
            key: r.order.id,
            href: `/admin/commandes/${r.order.id}`,
            cells: [
              <span key="n" className="font-bold">{r.order.number}</span>,
              <span key="d" className="text-subtle">{shortDate(r.order.createdAt)}</span>,
              <span key="l" className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{r.order.delivery?.rateName || "—"}</span>
                {!r.shippingKnown && <Pill tone="muted">port estimé</Pill>}
              </span>,
              <span key="ca" className="font-semibold whitespace-nowrap">{formatEuro(r.revenue)}</span>,
              <span key="p" className="whitespace-nowrap text-subtle">
                {formatEuro(r.shippingCharged)} / {formatEuro(r.shippingCost)}
              </span>,
              <span key="c" className="whitespace-nowrap text-subtle">{minus(r.costs)}</span>,
              <span key="net" className="font-extrabold whitespace-nowrap">{formatEuro(r.net)}</span>,
            ],
          }))}
        />
      </Card>

      <ActionForm action={saveCostsAction} submitLabel="Enregistrer les coûts" footerNote="Ces valeurs ne changent que l'affichage de cette page : ni les prix du site, ni les commandes déjà passées.">
        <Card title="Paramètres du calcul">
          <div className="grid grid-cols-5 gap-3 max-[1099px]:grid-cols-2">
            <Field label="URSSAF (%)" hint="Cotisations sur le CA encaissé." name="costs.urssafPct">
              <Input name="costs.urssafPct" type="number" step="0.01" min="0" max="100" defaultValue={(costs.urssafBp / 100).toString()} className="!font-bold" />
            </Field>
            <Field label="Un livre (€)" hint="Impression, à l'unité." name="costs.bookCostEuros">
              <Input name="costs.bookCostEuros" type="number" step="0.01" min="0" defaultValue={(costs.bookCost / 100).toString()} className="!font-bold" />
            </Field>
            <Field label="Emballage (€)" hint="Carton, calage, par colis." name="costs.packagingCostEuros">
              <Input name="costs.packagingCostEuros" type="number" step="0.01" min="0" defaultValue={(costs.packagingCost / 100).toString()} className="!font-bold" />
            </Field>
            <Field label="Paiement (%)" hint="Part variable Stripe." name="costs.stripePct">
              <Input name="costs.stripePct" type="number" step="0.01" min="0" max="100" defaultValue={(costs.stripeBp / 100).toString()} className="!font-bold" />
            </Field>
            <Field label="Paiement (€ fixes)" hint="Par transaction." name="costs.stripeFixedEuros">
              <Input name="costs.stripeFixedEuros" type="number" step="0.01" min="0" defaultValue={(costs.stripeFixed / 100).toString()} className="!font-bold" />
            </Field>
          </div>
          <span className="text-[0.6875rem] leading-relaxed text-subtle">
            Le port n'est pas saisi ici : il est connu commande par commande (barème fournisseur Boxtal, selon le transporteur choisi, le pays et le poids du colis). Les cartes de cette page se recalculent après enregistrement.
          </span>
        </Card>
      </ActionForm>
    </>
  );
}
