import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { ExpenseFields } from "@/components/admin/ExpenseFields";
import { ButtonLink, Card, FilterPills, GridTable, Notice, PageHeader, Pill, SearchBox, Tile } from "@/components/admin/ui";
import { saveExpenseAction } from "@/lib/admin/actions/expenses";
import { CATEGORY_LABELS, FAR_FUTURE, METHOD_LABELS, PERIODS, RECURRENCE_LABELS, dayLabel, findPeriod, matchesExpense, monthLabel, periodStart } from "@/lib/admin/expense-ui";
import { NO_SALES, type SalesFlow, byCategory, byMonth, byProduct, cashTotals, fixedCharges, fixedMonthly, inPeriod, sumSales } from "@/lib/admin/expenses";
import { COUNTED, capitalize } from "@/lib/admin/order-ui";
import { partOf } from "@/lib/admin/revenue";
import { requireAdmin } from "@/lib/auth/session";
import { listDocuments } from "@/lib/db/documents";
import { listExpenses } from "@/lib/db/expenses";
import { now as clock } from "@/lib/db/helpers";
import { listOrders } from "@/lib/db/orders";
import { listAllProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import type { ExpenseCategory } from "@/lib/domain/types";
import { dayKey } from "@/lib/stats/keys";

export const dynamic = "force-dynamic";

/*
 * Dépenses : toute la trésorerie de la société, dans un seul compte.
 *
 * Deux sources s'y rejoignent. Les lignes SAISIES — les frais, et les entrées d'un autre
 * bord (apport, subvention, remboursement, vente en salon). Et les VENTES du site, qui ne
 * se saisissent pas : elles sont déduites des commandes encaissées, et elles emportent
 * avec elles les cotisations URSSAF, prélevées sur chaque encaissement au taux des
 * réglages (`costs.urssafBp`, 12,30 % par défaut — modifiable dans Revenus).
 *
 * La différence avec /admin/revenus tient en une phrase : là-bas on regarde ce qu'une
 * VENTE laisse une fois tous ses coûts retirés (fabrication, port réel, commission) ;
 * ici on regarde ce que le COMPTE fait sur une période, frais de structure compris.
 *
 * Les cotisations affichées ici sont une PROVISION, calculée sur les ventes — pas un
 * versement constaté. Saisir en plus le paiement à l'URSSAF le compterait deux fois :
 * l'écran le signale si le cas se présente.
 *
 * Un mouvement porte son jour (AAAA-MM-JJ), son poste, éventuellement un titre et un
 * justificatif de la bibliothèque de documents. Les calculs vivent dans
 * `lib/admin/expenses.ts` (fonctions pures, testées) ; cette page ne fait que les montrer.
 */

const minus = (cents: number) => (cents === 0 ? formatEuro(0) : `− ${formatEuro(cents)}`);
const fmt = (n: number) => n.toLocaleString("fr-FR");
/** 1230 → « 12,3 % ». Les taux sont stockés en points de base. */
const bpLabel = (bp: number) => `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export default async function DepensesPage({ searchParams }: PageProps<"/admin/depenses">) {
  await requireAdmin();
  const { periode, poste, q } = await searchParams;
  const period = findPeriod(periode);
  const search = typeof q === "string" ? q.trim() : "";

  const [all, products, documents, orders, settings] = await Promise.all([listExpenses(), listAllProducts(), listDocuments(), listOrders({ limit: 2000 }), getSettings()]);
  const urssafBp = settings.costs.urssafBp;

  const today = dayKey(clock());
  const from = periodStart(period, today);
  const ofPeriod = inPeriod(all, from, FAR_FUTURE);

  const category = typeof poste === "string" && poste in CATEGORY_LABELS ? (poste as ExpenseCategory) : null;
  const rows = ofPeriod.filter((e) => (!category || e.category === category) && matchesExpense(e, search));

  /*
   * Les ventes, mois par mois. Mêmes règles de comptage que le tableau de bord et
   * /admin/revenus — commandes réelles (livemode), statuts encaissés, kits offerts mis
   * de côté : un kit n'encaisse rien. La retenue se calcule commande par commande, pour
   * que les deux écrans tombent au centime près sur le même chiffre.
   */
  const salesByMonth = new Map<string, SalesFlow>();
  for (const o of orders) {
    if (!o.livemode || !COUNTED.includes(o.status) || o.kit) continue;
    const day = dayKey(o.createdAt);
    if (from && day < from) continue;
    const month = day.slice(0, 7);
    const flow = salesByMonth.get(month) ?? { ...NO_SALES };
    salesByMonth.set(month, { orders: flow.orders + 1, revenue: flow.revenue + o.totals.total, urssaf: flow.urssaf + partOf(o.totals.total, urssafBp) });
  }

  /*
   * Un filtre par poste (ou une recherche) ne parle que des lignes saisies : y laisser
   * les ventes du site ferait mentir les totaux, qui ne porteraient plus sur la même
   * chose que la liste en dessous.
   */
  const narrowed = Boolean(category || search);
  const sales = narrowed ? NO_SALES : sumSales([...salesByMonth.values()]);

  const t = cashTotals(rows, sales);
  const incomes = byCategory(rows, "in");
  const months = byMonth(rows, narrowed ? new Map() : salesByMonth);
  const pending = rows.filter((e) => e.status === "pending").length;

  /** Conserve les filtres courants d'un lien à l'autre ; « annee » est la valeur par défaut, donc implicite. */
  const params = (over: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      periode: period.key === "annee" ? undefined : period.key,
      poste: category ?? undefined,
      q: search || undefined,
      ...over,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  /*
   * Poste par poste. Les cotisations ne sont pas une ligne saisie : elles se glissent
   * dans le classement à leur place, et c'est presque toujours la première.
   */
  const slices = [
    ...(sales.urssaf > 0 ? [{ key: "urssaf", label: "Cotisations URSSAF", amount: sales.urssaf, note: `${bpLabel(urssafBp)} de ${formatEuro(sales.revenue)} encaissés`, href: undefined as string | undefined }] : []),
    ...byCategory(rows).map((c) => ({
      key: c.category,
      label: CATEGORY_LABELS[c.category],
      amount: c.amount,
      note: `${fmt(c.count)} ligne${c.count > 1 ? "s" : ""} · ${t.out > 0 ? `${Math.round((c.amount / t.out) * 100)} % des sorties` : "–"}`,
      href: `/admin/depenses${params({ poste: c.category })}` as string | undefined,
    })),
  ].sort((a, b) => b.amount - a.amount);
  const barMax = Math.max(1, ...slices.map((s) => s.amount));

  /* Le versement à l'URSSAF saisi à la main ferait doublon avec la provision ci-dessus. */
  const urssafEntered = rows.filter((e) => e.direction === "out" && e.category === "taxes" && /urssaf/i.test(e.label));

  /*
   * Charges fixes et coût par titre se lisent sur TOUT l'historique : ce que coûte un
   * abonnement aujourd'hui, et ce qu'un livre a coûté depuis le premier jour, ne
   * dépendent pas de la fenêtre affichée.
   */
  const fixed = fixedCharges(all);
  const perProduct = byProduct(all);
  const titleOf = (slug: string) => products.find((p) => p.slug === slug)?.title ?? slug;

  return (
    <>
      <PageHeader
        title="Dépenses"
        subtitle="Tout ce qui entre et tout ce qui sort : les ventes du site, les cotisations qu'elles déclenchent, et les frais de la maison."
        actions={
          <>
            <nav className="flex gap-1.5" aria-label="Période">
              {PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/admin/depenses${params({ periode: p.key === "annee" ? undefined : p.key })}`}
                  className={`rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${p.key === period.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}
                >
                  {p.label}
                </Link>
              ))}
            </nav>
            <ButtonLink href={`/admin/depenses/export${params({})}`} prefetch={false}>
              Exporter en CSV
            </ButtonLink>
          </>
        }
      />

      {narrowed && (
        <Notice tone="info">
          Vue filtrée : seules les lignes saisies sont comptées. Les ventes du site et les cotisations reviennent dès que le filtre est retiré.{" "}
          <Link href={`/admin/depenses${params({ poste: undefined, q: undefined })}`} className="font-bold underline">
            Tout revoir
          </Link>
        </Notice>
      )}

      {urssafEntered.length > 0 && (
        <Notice tone="error">
          {urssafEntered.length > 1 ? `${fmt(urssafEntered.length)} lignes saisies ressemblent à un versement URSSAF` : `« ${urssafEntered[0].label} » ressemble à un versement URSSAF`} : les cotisations sont déjà calculées
          ci-dessous sur les ventes ({bpLabel(urssafBp)}), elles comptent donc deux fois. Supprimez la ligne saisie, ou renommez-la si elle porte sur autre chose.
        </Notice>
      )}

      {pending > 0 && (
        <Notice tone="info">
          {fmt(pending)} ligne{pending > 1 ? "s" : ""} engagée{pending > 1 ? "s" : ""} pour {formatEuro(t.pending)} : reçue{pending > 1 ? "s" : ""}, pas encore payée{pending > 1 ? "s" : ""}. Elles ne comptent pas dans les sorties
          ci-dessous.
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile
          tone="green"
          label="Entrées"
          value={formatEuro(t.in)}
          note={sales.revenue > 0 ? `dont ${formatEuro(sales.revenue)} de ventes · ${fmt(sales.orders)} commande${sales.orders > 1 ? "s" : ""}` : "aucune vente encaissée sur la période"}
          href="/admin/revenus"
        />
        <Tile tone="pink" label="Cotisations URSSAF" value={minus(sales.urssaf)} note={`${bpLabel(urssafBp)} des ventes encaissées`} />
        <Tile tone="sand" label="Frais payés" value={minus(t.entered.out)} note={`${fmt(rows.filter((e) => e.direction === "out" && e.status === "paid").length)} paiement(s) saisi(s)`} />
        <Tile tone={t.net >= 0 ? "green" : "pink"} label="Solde" value={formatEuro(t.net)} note="entrées − cotisations − frais" />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <Card title="Où part l'argent" aside={<span className="text-xs font-bold text-subtle">Période affichée</span>}>
          {slices.length === 0 ? (
            <p className="text-[0.8125rem] text-muted">Aucune sortie sur la période.</p>
          ) : (
            slices.map((s) => {
              const body = (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.8125rem] font-bold">{s.label}</span>
                    <span className="whitespace-nowrap text-[0.8125rem] font-extrabold">{minus(s.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-pill bg-line-soft">
                    <div className={`h-full rounded-pill ${s.key === "urssaf" ? "bg-tint-pink-ink" : "bg-ink"}`} style={{ width: `${Math.max(2, Math.round((s.amount / barMax) * 100))}%` }} />
                  </div>
                  <span className="text-xs text-subtle">{s.note}</span>
                </>
              );
              return s.href ? (
                <Link key={s.key} href={s.href} className="flex flex-col gap-1.5 hover:opacity-70">
                  {body}
                </Link>
              ) : (
                <div key={s.key} className="flex flex-col gap-1.5">
                  {body}
                </div>
              );
            })
          )}
          {sales.urssaf > 0 && (
            <span className="text-[0.6875rem] leading-relaxed text-subtle">
              Les cotisations ne se saisissent pas : elles sont calculées sur chaque commande encaissée, au taux des réglages. C'est une provision — le versement réel, lui, n'a pas à être ressaisi. Le taux se change dans{" "}
              <Link href="/admin/revenus" className="font-bold underline">
                Revenus
              </Link>
              .
            </span>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Charges fixes" aside={<span className="text-xs font-bold text-subtle">{fixed.length > 0 ? `${formatEuro(fixedMonthly(all))} par mois` : "Par mois"}</span>}>
            {fixed.length === 0 ? (
              <p className="text-[0.8125rem] text-muted">
                Aucun frais marqué comme récurrent. Le rythme se choisit à la saisie : un abonnement mensuel ou une assurance annuelle apparaîtront ici, ramenés au mois.
              </p>
            ) : (
              fixed.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 border-t border-line-soft pt-2.5 text-[0.8125rem] first:border-0 first:pt-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{c.label}</span>
                    <span className="text-xs text-subtle">
                      {c.supplier ? `${c.supplier} · ` : ""}
                      {RECURRENCE_LABELS[c.recurrence].toLowerCase()} · {formatEuro(c.amount)}
                    </span>
                  </span>
                  <Pill>{formatEuro(c.monthly)}</Pill>
                </div>
              ))
            )}
            {fixed.length > 0 && <span className="text-[0.6875rem] leading-relaxed text-subtle">Seule la dernière occurrence de chaque abonnement compte : trois ans d'assurance annuelle ne font qu'une charge.</span>}
          </Card>

          {(sales.revenue > 0 || incomes.length > 0) && (
            <Card tone="green" title="D'où vient l'argent">
              {sales.revenue > 0 && (
                <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">Ventes du site</span>
                    <span className="text-xs opacity-70">
                      {fmt(sales.orders)} commande{sales.orders > 1 ? "s" : ""} encaissée{sales.orders > 1 ? "s" : ""}, port compris
                    </span>
                  </span>
                  <span className="font-extrabold">{formatEuro(sales.revenue)}</span>
                </div>
              )}
              {incomes.map((c) => (
                <div key={c.category} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="font-bold">{CATEGORY_LABELS[c.category]}</span>
                  <span className="font-extrabold">{formatEuro(c.amount)}</span>
                </div>
              ))}
              {sales.revenue > 0 && (
                <>
                  <div className="flex items-baseline justify-between gap-3 border-t border-current/20 pt-2.5 text-[0.8125rem]">
                    <span className="font-bold">Une fois l'URSSAF retirée</span>
                    <span className="font-extrabold">{formatEuro(t.in - sales.urssaf)}</span>
                  </div>
                  <span className="text-[0.6875rem] leading-relaxed">
                    Les kits offerts aux partenaires ne sont pas là : ils n'encaissent rien. Ce que chaque vente laisse une fois TOUS ses coûts retirés (fabrication, port réel, commission) se lit dans Revenus.
                  </span>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      {perProduct.length > 0 && (
        <Card
          title="Ce que chaque titre a coûté"
          aside={<span className="text-xs font-bold text-subtle">Tout l'historique</span>}
          className="!p-6 [&>div:last-child]:-mx-6 [&>div:last-child]:rounded-none [&>div:last-child]:py-0"
        >
          <GridTable
            columns="1fr 90px 130px 130px 130px"
            head={["Titre", "Lignes", "Total engagé", "Exemplaires", "Par exemplaire"]}
            rows={perProduct.map((p) => ({
              key: p.slug,
              cells: [
                <span key="t" className="truncate font-bold">
                  {titleOf(p.slug)}
                </span>,
                <span key="n" className="text-subtle">
                  {fmt(p.count)}
                </span>,
                <span key="a" className="whitespace-nowrap font-semibold">
                  {minus(p.amount)}
                </span>,
                <span key="u" className="text-subtle">
                  {p.units ? fmt(p.units) : "—"}
                </span>,
                <span key="pu" className="whitespace-nowrap font-extrabold">
                  {p.perUnit === null ? "—" : formatEuro(p.perUnit)}
                </span>,
              ],
            }))}
          />
          <span className="text-[0.6875rem] leading-relaxed text-subtle">
            Le coût par exemplaire ne se calcule que sur les lignes où le nombre d'exemplaires couverts a été saisi (un tirage, une série d'essais) : sans quoi on rapporterait un tirage entier à un seul livre.
          </span>
        </Card>
      )}

      <Card collapsible defaultOpen title="Ajouter un mouvement" aside={<span className="text-xs font-bold text-subtle">Frais, apport, remboursement…</span>}>
        {/*
         * `key` sur le NOMBRE de lignes : après un ajout la page se rafraîchit, la clé
         * change, React remonte le formulaire — les champs sont donc vides pour la
         * saisie suivante, au lieu de garder la facture précédente. (La première ligne
         * ne ferait pas l'affaire : un frais daté d'hier ne se met pas en tête.)
         */}
        <ActionForm key={`saisie-${all.length}`} action={saveExpenseAction} submitLabel="Ajouter" footerNote="Les ventes du site sont déjà comptées, commande par commande : à saisir ici, elles compteraient deux fois.">
          <ExpenseFields products={products} documents={documents} />
        </ActionForm>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          items={[
            { href: `/admin/depenses${params({ poste: undefined })}`, label: "Tous les postes", count: ofPeriod.length, active: !category },
            ...[...byCategory(ofPeriod), ...byCategory(ofPeriod, "in")].map((c) => ({
              href: `/admin/depenses${params({ poste: c.category })}`,
              label: CATEGORY_LABELS[c.category],
              count: c.count,
              active: category === c.category,
            })),
          ]}
        />
        <SearchBox
          action="/admin/depenses"
          defaultValue={search}
          placeholder="Intitulé, fournisseur…"
          hidden={{ ...(period.key !== "annee" ? { periode: period.key } : {}), ...(category ? { poste: category } : {}) }}
        />
      </div>

      <GridTable
        columns="90px 1fr 170px 120px 110px 110px"
        head={["Date", "Intitulé", "Poste", "Titre", "Règlement", "Montant"]}
        empty={all.length === 0 ? "Rien de saisi pour l'instant : ajoutez votre premier frais ci-dessus." : "Aucune ligne ne correspond."}
        rows={rows.map((e) => ({
          key: e.id,
          href: `/admin/depenses/${e.id}`,
          cells: [
            <span key="d" className="text-subtle">
              {dayLabel(e.date)}
            </span>,
            <span key="l" className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-bold">{e.label}</span>
                {e.status === "pending" && <Pill tone="warn">engagé</Pill>}
                {e.recurrence !== "once" && <Pill tone="muted">{RECURRENCE_LABELS[e.recurrence].toLowerCase()}</Pill>}
                {e.documentId && <Pill tone="blue">pièce</Pill>}
              </span>
              {e.supplier && <span className="truncate text-xs text-subtle">{e.supplier}</span>}
            </span>,
            <span key="c" className="truncate text-subtle">
              {CATEGORY_LABELS[e.category]}
            </span>,
            <span key="p" className="truncate text-subtle">
              {e.productSlug ? titleOf(e.productSlug) : "—"}
            </span>,
            <span key="m" className="text-subtle">
              {METHOD_LABELS[e.method]}
            </span>,
            <span key="a" className={`whitespace-nowrap font-extrabold ${e.direction === "in" ? "text-tint-green-ink" : ""}`}>
              {e.direction === "in" ? formatEuro(e.amount) : minus(e.amount)}
            </span>,
          ],
        }))}
      />

      {months.length > 1 && (
        <Card title="Mois par mois" className="!p-6 [&>div:last-child]:-mx-6 [&>div:last-child]:rounded-none [&>div:last-child]:py-0">
          <GridTable
            columns="1fr 120px 120px 120px 120px 120px"
            head={["Mois", "Ventes", "Cotisations", "Frais payés", "Autres entrées", "Solde"]}
            rows={months.map((m) => ({
              key: m.month,
              cells: [
                <span key="m" className="font-bold">
                  {capitalize(monthLabel(m.month))}
                </span>,
                <span key="v" className="whitespace-nowrap font-semibold">
                  {m.sales.revenue > 0 ? formatEuro(m.sales.revenue) : "—"}
                </span>,
                <span key="u" className="whitespace-nowrap text-subtle">
                  {m.sales.urssaf > 0 ? minus(m.sales.urssaf) : "—"}
                </span>,
                <span key="o" className="whitespace-nowrap text-subtle">
                  {m.entered.out > 0 ? minus(m.entered.out) : "—"}
                </span>,
                <span key="i" className="whitespace-nowrap text-subtle">
                  {m.entered.in > 0 ? formatEuro(m.entered.in) : "—"}
                </span>,
                <span key="s" className={`whitespace-nowrap font-extrabold ${m.net < 0 ? "text-danger" : ""}`}>
                  {formatEuro(m.net)}
                </span>,
              ],
            }))}
          />
        </Card>
      )}
    </>
  );
}
