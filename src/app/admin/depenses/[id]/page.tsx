import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { ExpenseFields } from "@/components/admin/ExpenseFields";
import { ButtonLink, Card, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { deleteExpenseAction, saveExpenseAction } from "@/lib/admin/actions/expenses";
import { CATEGORY_LABELS, DOC_KIND_LABELS, METHOD_LABELS, RECURRENCE_LABELS, dayLabel, fileSize } from "@/lib/admin/expense-ui";
import { monthlyCost, splitCents, urssafOn } from "@/lib/admin/expenses";
import { requireAdmin } from "@/lib/auth/session";
import { listDocuments } from "@/lib/db/documents";
import { getExpense } from "@/lib/db/expenses";
import { listAllProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/*
 * Fiche d'un mouvement d'argent : les mêmes champs qu'à la saisie, plus ce qui ne se
 * saisit pas — ce que le frais pèse par mois s'il revient, comment il se partage entre
 * les titres qu'il couvre, et les pièces attachées, qu'on ouvre d'ici.
 */
export default async function ExpensePage({ params }: PageProps<"/admin/depenses/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const expense = await getExpense(id);
  if (!expense) notFound();

  const [products, documents, settings] = await Promise.all([listAllProducts(), listDocuments(), getSettings()]);
  const monthly = monthlyCost(expense.amount, expense.recurrence);
  const urssafBp = settings.costs.urssafBp;
  const urssaf = urssafOn(expense, urssafBp);
  const rate = `${(urssafBp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

  /* Ce que chaque titre porte de ce frais : la même répartition que dans les totaux. */
  const parts = splitCents(expense.amount, expense.productSlugs.length);
  const titles = expense.productSlugs.map((slug, i) => ({ slug, title: products.find((p) => p.slug === slug)?.title ?? slug, share: parts[i] }));
  const justificatifs = expense.documentIds.map((docId) => documents.find((d) => d.id === docId)).filter((d) => d !== undefined);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/depenses", label: "Dépenses" }}
        title={expense.label}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={expense.direction === "in" ? "ok" : "neutral"}>{expense.direction === "in" ? "Entrée" : "Sortie"}</Pill>
            <Pill tone="muted">{CATEGORY_LABELS[expense.category]}</Pill>
            {expense.status === "pending" && <Pill tone="warn">engagé, pas encore payé</Pill>}
            <span>
              {dayLabel(expense.date)} · {METHOD_LABELS[expense.method]}
              {expense.supplier ? ` · ${expense.supplier}` : ""}
            </span>
          </span>
        }
        actions={
          <ActionForm action={deleteExpenseAction} submitLabel="Supprimer" submitTone="danger" confirm={`Supprimer « ${expense.label} » ? Cette ligne ne comptera plus dans vos totaux.`}>
            <input type="hidden" name="id" value={expense.id} />
          </ActionForm>
        }
      />

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2 max-[599px]:grid-cols-1">
        <Tile tone={expense.direction === "in" ? "green" : "sand"} label="Montant TTC" value={formatEuro(expense.amount)} note={expense.status === "paid" ? "réglé" : "à régler"} />
        {expense.direction === "in" ? (
          <Tile
            tone="pink"
            label="Cotisations URSSAF"
            value={urssaf > 0 ? `− ${formatEuro(urssaf)}` : "—"}
            note={urssaf > 0 ? `${rate} · il reste ${formatEuro(expense.amount - urssaf)}` : expense.taxable ? "entrée pas encore encaissée" : "entrée non soumise aux cotisations"}
          />
        ) : (
          <Tile label="Cotisations URSSAF" value="—" note="une sortie ne cotise rien" />
        )}
        <Tile label="Rythme" value={RECURRENCE_LABELS[expense.recurrence]} note={monthly > 0 ? `${formatEuro(monthly)} par mois` : "sans effet sur les charges fixes"} />
        <Tile
          label="Titres concernés"
          value={titles.length === 0 ? "—" : titles.length === 1 ? titles[0].title : String(titles.length)}
          note={titles.length === 0 ? "frais de structure" : titles.length === 1 ? "frais rattaché à ce livre" : `${formatEuro(titles[0].share)} par titre environ`}
          href={titles.length === 1 ? `/admin/produits/${titles[0].slug}` : undefined}
        />
      </div>

      {titles.length > 1 && (
        <Card title="Comment ce frais se partage" aside={<span className="text-xs font-bold text-subtle">À parts égales</span>}>
          {titles.map((t) => (
            <div key={t.slug} className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-2.5 text-[0.8125rem] first:border-0 first:pt-0">
              <Link href={`/admin/produits/${t.slug}`} className="truncate font-bold hover:underline">
                {t.title}
              </Link>
              <span className="whitespace-nowrap font-extrabold">{formatEuro(t.share)}</span>
            </div>
          ))}
          <span className="text-[0.6875rem] leading-relaxed text-subtle">
            C'est la répartition retenue dans « Ce que chaque titre a coûté ». Le centime qui ne tombe pas juste va au premier de la liste, pour que la somme fasse exactement {formatEuro(expense.amount)}.
          </span>
        </Card>
      )}

      <Card title={justificatifs.length > 1 ? `Justificatifs (${justificatifs.length})` : "Justificatif"}>
        {justificatifs.length === 0 ? (
          <p className="text-[0.8125rem] text-muted">
            Aucune pièce attachée. Joignez la facture depuis « Modifier », plus bas : le fichier rejoint la{" "}
            <Link href="/admin/documents" className="font-bold underline">
              bibliothèque privée
            </Link>{" "}
            et reste consultable depuis cette ligne.
          </p>
        ) : (
          justificatifs.map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3 text-[0.8125rem] first:border-0 first:pt-0">
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href="/admin/documents" className="truncate font-bold hover:underline">
                    {doc.title}
                  </Link>
                  <Pill tone="muted">{DOC_KIND_LABELS[doc.kind]}</Pill>
                </span>
                <span className="truncate text-xs text-subtle">
                  {doc.filename} · {fileSize(doc.size)}
                  {doc.issuedAt ? ` · daté du ${dayLabel(doc.issuedAt)}` : ""}
                </span>
              </span>
              <ButtonLink href={`/api/documents/${doc.id}`} target="_blank" prefetch={false}>
                Ouvrir
              </ButtonLink>
            </div>
          ))
        )}
      </Card>

      <Card title="Modifier">
        <ActionForm action={saveExpenseAction} submitLabel="Enregistrer" secondary={<ButtonLink href="/admin/depenses">Retour à la liste</ButtonLink>}>
          <ExpenseFields expense={expense} products={products} documents={documents} urssafBp={urssafBp} />
        </ActionForm>
      </Card>
    </>
  );
}
