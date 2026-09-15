import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { ExpenseFields } from "@/components/admin/ExpenseFields";
import { ButtonLink, Card, FilterPills, GridTable, Notice, PageHeader, Pill, SearchBox, Tile } from "@/components/admin/ui";
import { saveExpenseAction } from "@/lib/admin/actions/expenses";
import { CATEGORY_LABELS, FAR_FUTURE, METHOD_LABELS, PERIODS, RECURRENCE_LABELS, dayLabel, findPeriod, matchesExpense, monthLabel, periodStart } from "@/lib/admin/expense-ui";
import { byCategory, byMonth, byProduct, fixedCharges, fixedMonthly, inPeriod, sumExpenses } from "@/lib/admin/expenses";
import { capitalize } from "@/lib/admin/order-ui";
import { requireAdmin } from "@/lib/auth/session";
import { listDocuments } from "@/lib/db/documents";
import { listExpenses } from "@/lib/db/expenses";
import { now as clock } from "@/lib/db/helpers";
import { listAllProducts } from "@/lib/db/products";
import { formatEuro } from "@/lib/domain/money";
import type { ExpenseCategory } from "@/lib/domain/types";
import { dayKey } from "@/lib/stats/keys";

export const dynamic = "force-dynamic";

/*
 * Dépenses : tout ce que la société paie, et ce qu'elle encaisse EN DEHORS des ventes du
 * site. Les ventes, elles, se déduisent des commandes — c'est /admin/revenus qui en
 * parle. Les deux pages restent séparées à dessein : ici on saisit à la main, là-bas
 * tout se calcule.
 *
 * Un mouvement porte son jour (AAAA-MM-JJ), son poste, éventuellement un titre et un
 * justificatif de la bibliothèque de documents. Les calculs vivent dans
 * `lib/admin/expenses.ts` (fonctions pures, testées) ; cette page ne fait que les montrer.
 */

const minus = (cents: number) => (cents === 0 ? formatEuro(0) : `− ${formatEuro(cents)}`);
const fmt = (n: number) => n.toLocaleString("fr-FR");

export default async function DepensesPage({ searchParams }: PageProps<"/admin/depenses">) {
  await requireAdmin();
  const { periode, poste, q } = await searchParams;
  const period = findPeriod(periode);
  const search = typeof q === "string" ? q.trim() : "";

  const [all, products, documents] = await Promise.all([listExpenses(), listAllProducts(), listDocuments()]);

  const today = dayKey(clock());
  const from = periodStart(period, today);
  const ofPeriod = inPeriod(all, from, FAR_FUTURE);

  const category = typeof poste === "string" && poste in CATEGORY_LABELS ? (poste as ExpenseCategory) : null;
  const rows = ofPeriod.filter((e) => (!category || e.category === category) && matchesExpense(e, search));

  const t = sumExpenses(rows);
  const costs = byCategory(rows);
  const incomes = byCategory(rows, "in");
  const barMax = Math.max(1, ...costs.map((c) => c.amount));
  const months = byMonth(rows);
  const pending = rows.filter((e) => e.status === "pending").length;

  /*
   * Charges fixes et coût par titre se lisent sur TOUT l'historique : ce que coûte un
   * abonnement aujourd'hui, et ce qu'un livre a coûté depuis le premier jour, ne
   * dépendent pas de la fenêtre affichée.
   */
  const fixed = fixedCharges(all);
  const perProduct = byProduct(all);
  const titleOf = (slug: string) => products.find((p) => p.slug === slug)?.title ?? slug;

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

  return (
    <>
      <PageHeader
        title="Dépenses"
        subtitle="Ce que la société paie, et ce qu'elle encaisse en dehors des ventes du site."
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

      {pending > 0 && (
        <Notice tone="info">
          {fmt(pending)} ligne{pending > 1 ? "s" : ""} engagée{pending > 1 ? "s" : ""} pour {formatEuro(t.pending)} : reçue{pending > 1 ? "s" : ""}, pas encore payée{pending > 1 ? "s" : ""}. Elles ne comptent pas dans les sorties
          ci-dessous.
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile tone="sand" label="Sorties" value={minus(t.out)} note={`${fmt(rows.filter((e) => e.direction === "out" && e.status === "paid").length)} paiement(s) sur la période`} />
        <Tile tone="green" label="Entrées" value={formatEuro(t.in)} note="hors ventes du site" />
        <Tile tone={t.net >= 0 ? "green" : "pink"} label="Solde" value={formatEuro(t.net)} note="entrées − sorties payées" />
        <Tile tone="dark" label="Charges fixes" value={formatEuro(fixedMonthly(all))} note={`par mois · ${fmt(fixed.length)} abonnement(s)`} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <Card title="Où part l'argent" aside={<span className="text-xs font-bold text-subtle">Période affichée</span>}>
          {costs.length === 0 ? (
            <p className="text-[0.8125rem] text-muted">Aucune sortie sur la période.</p>
          ) : (
            costs.map((c) => (
              <Link key={c.category} href={`/admin/depenses${params({ poste: c.category })}`} className="flex flex-col gap-1.5 hover:opacity-70">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.8125rem] font-bold">{CATEGORY_LABELS[c.category]}</span>
                  <span className="whitespace-nowrap text-[0.8125rem] font-extrabold">{minus(c.amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-pill bg-line-soft">
                  <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.max(2, Math.round((c.amount / barMax) * 100))}%` }} />
                </div>
                <span className="text-xs text-subtle">
                  {fmt(c.count)} ligne{c.count > 1 ? "s" : ""} · {t.out > 0 ? `${Math.round((c.amount / t.out) * 100)} % des sorties` : "–"}
                </span>
              </Link>
            ))
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Charges fixes" aside={<span className="text-xs font-bold text-subtle">Par mois</span>}>
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

          {incomes.length > 0 && (
            <Card tone="green" title="D'où vient l'argent">
              {incomes.map((c) => (
                <div key={c.category} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="font-bold">{CATEGORY_LABELS[c.category]}</span>
                  <span className="font-extrabold">{formatEuro(c.amount)}</span>
                </div>
              ))}
              <span className="text-[0.6875rem] leading-relaxed">Les ventes du site n'y sont pas : elles se lisent dans Revenus, calculées depuis les commandes.</span>
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
        <ActionForm key={`saisie-${all.length}`} action={saveExpenseAction} submitLabel="Ajouter" footerNote="Les ventes du site ne se saisissent pas ici : elles viennent des commandes.">
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
            columns="1fr 90px 130px 130px 130px"
            head={["Mois", "Lignes", "Sorties", "Entrées", "Solde"]}
            rows={months.map((m) => ({
              key: m.month,
              cells: [
                <span key="m" className="font-bold">
                  {capitalize(monthLabel(m.month))}
                </span>,
                <span key="n" className="text-subtle">
                  {fmt(m.count)}
                </span>,
                <span key="o" className="whitespace-nowrap font-semibold">
                  {minus(m.out)}
                </span>,
                <span key="i" className="whitespace-nowrap text-subtle">
                  {formatEuro(m.in)}
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
