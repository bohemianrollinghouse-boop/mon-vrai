import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { ExpenseFields } from "@/components/admin/ExpenseFields";
import { ButtonLink, Card, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { deleteExpenseAction, saveExpenseAction } from "@/lib/admin/actions/expenses";
import { CATEGORY_LABELS, METHOD_LABELS, RECURRENCE_LABELS, dayLabel, fileSize } from "@/lib/admin/expense-ui";
import { monthlyCost } from "@/lib/admin/expenses";
import { requireAdmin } from "@/lib/auth/session";
import { getDocument, listDocuments } from "@/lib/db/documents";
import { getExpense } from "@/lib/db/expenses";
import { listAllProducts } from "@/lib/db/products";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/*
 * Fiche d'un mouvement d'argent : les mêmes champs qu'à la saisie, plus ce qui ne se
 * saisit pas — ce que le frais pèse par mois s'il revient, ce qu'il coûte par exemplaire
 * s'il couvre un tirage, et le justificatif attaché, qu'on ouvre d'ici.
 */
export default async function ExpensePage({ params }: PageProps<"/admin/depenses/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const expense = await getExpense(id);
  if (!expense) notFound();

  const [products, documents, justificatif] = await Promise.all([listAllProducts(), listDocuments(), expense.documentId ? getDocument(expense.documentId) : Promise.resolve(null)]);
  const product = expense.productSlug ? products.find((p) => p.slug === expense.productSlug) : undefined;
  const monthly = monthlyCost(expense.amount, expense.recurrence);

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

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile tone={expense.direction === "in" ? "green" : "sand"} label="Montant TTC" value={formatEuro(expense.amount)} note={expense.status === "paid" ? "réglé" : "à régler"} />
        <Tile label="Rythme" value={RECURRENCE_LABELS[expense.recurrence]} note={monthly > 0 ? `${formatEuro(monthly)} par mois` : "sans effet sur les charges fixes"} />
        <Tile
          label="Par exemplaire"
          value={expense.units > 0 ? formatEuro(Math.round(expense.amount / expense.units)) : "—"}
          note={expense.units > 0 ? `${expense.units.toLocaleString("fr-FR")} exemplaires couverts` : "nombre d'exemplaires non renseigné"}
        />
        <Tile label="Titre concerné" value={product ? product.title : "—"} note={product ? "frais rattaché à ce livre" : "frais de structure"} href={product ? `/admin/produits/${product.slug}` : undefined} />
      </div>

      {justificatif ? (
        <Card title="Justificatif" aside={<ButtonLink href={`/api/documents/${justificatif.id}`} target="_blank" prefetch={false}>Ouvrir le fichier</ButtonLink>}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 text-[0.8125rem]">
            <Link href="/admin/documents" className="font-bold hover:underline">
              {justificatif.title}
            </Link>
            <span className="text-subtle">
              {justificatif.filename} · {fileSize(justificatif.size)}
              {justificatif.issuedAt ? ` · daté du ${dayLabel(justificatif.issuedAt)}` : ""}
            </span>
          </div>
        </Card>
      ) : (
        <Card title="Justificatif">
          <p className="text-[0.8125rem] text-muted">
            Aucune pièce attachée. Déposez la facture dans <Link href="/admin/documents" className="font-bold underline">Documents</Link>, puis choisissez-la ci-dessous : elle restera consultable depuis cette ligne.
          </p>
        </Card>
      )}

      <Card title="Modifier">
        <ActionForm action={saveExpenseAction} submitLabel="Enregistrer" secondary={<ButtonLink href="/admin/depenses">Retour à la liste</ButtonLink>}>
          <ExpenseFields expense={expense} products={products} documents={documents} />
        </ActionForm>
      </Card>
    </>
  );
}
