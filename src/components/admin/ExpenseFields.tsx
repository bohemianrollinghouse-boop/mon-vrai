import { CATEGORY_LABELS, IN_CATEGORIES, METHOD_LABELS, OUT_CATEGORIES, RECURRENCE_LABELS } from "@/lib/admin/expense-ui";
import { now } from "@/lib/db/helpers";
import type { BusinessDoc, Expense, ExpenseMethod, ExpenseRecurrence, Product } from "@/lib/domain/types";
import { dayKey } from "@/lib/stats/keys";
import { Field } from "./Field";
import { Input, Segmented, Select, Textarea } from "./ui";

/*
 * Les champs d'un mouvement d'argent, partagés par la saisie rapide de /admin/depenses
 * et la fiche /admin/depenses/<id> — un seul endroit à corriger le jour où un champ
 * s'ajoute. Composant serveur sans état : il se contente de poser des champs nommés,
 * que `saveExpenseAction` relit.
 *
 * Le poste est un seul menu, en deux groupes : mettre les entrées ailleurs obligerait à
 * du JavaScript pour suivre le sens choisi, alors qu'un <optgroup> le dit aussi bien.
 */
export function ExpenseFields({ expense, products, documents }: { expense?: Expense; products: Product[]; documents: BusinessDoc[] }) {
  // Le jour de Paris, pas celui d'UTC : passé minuit l'été, les deux ne sont plus le même.
  const today = dayKey(now());

  return (
    <>
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2 max-[599px]:grid-cols-1">
        <Field label="Sens" hint="Les ventes du site ne se saisissent pas ici." name="direction">
          <Segmented
            name="direction"
            defaultValue={expense?.direction ?? "out"}
            options={[
              { value: "out", label: "Sortie" },
              { value: "in", label: "Entrée" },
            ]}
          />
        </Field>
        <Field label="Date" hint="Jour de la facture ou du paiement." name="date">
          <Input name="date" type="date" defaultValue={expense?.date ?? today} required />
        </Field>
        <Field label="Montant TTC (€)" hint="Tel qu'il apparaît sur le relevé." name="amountEuros">
          <Input name="amountEuros" inputMode="decimal" placeholder="149,90" defaultValue={expense ? (expense.amount / 100).toFixed(2) : ""} className="!font-bold" required />
        </Field>
        <Field label="Poste" name="category">
          <Select name="category" defaultValue={expense?.category ?? "certification"}>
            <optgroup label="Sorties">
              {OUT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Entrées">
              {IN_CATEGORIES.filter((c) => c !== "other").map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
        <Field label="Intitulé" hint="Ce que vous reconnaîtrez dans un an." name="label">
          <Input name="label" defaultValue={expense?.label ?? ""} placeholder="Essais de conformité EN 71-3" maxLength={120} required />
        </Field>
        <Field label="Fournisseur" hint="Laboratoire, imprimeur, organisme…" name="supplier">
          <Input name="supplier" defaultValue={expense?.supplier ?? ""} placeholder="Bureau Veritas" maxLength={120} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3 max-[599px]:grid-cols-1">
        <Field label="Règlement" name="method">
          <Select name="method" defaultValue={expense?.method ?? "card"}>
            {(Object.keys(METHOD_LABELS) as ExpenseMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="État" hint="« Engagé » = reçu, pas encore payé." name="status">
          <Segmented
            name="status"
            defaultValue={expense?.status ?? "paid"}
            options={[
              { value: "paid", label: "Payé" },
              { value: "pending", label: "Engagé" },
            ]}
          />
        </Field>
        <Field label="Rythme" hint="Un frais qui revient compte dans les charges fixes." name="recurrence">
          <Select name="recurrence" defaultValue={expense?.recurrence ?? "once"}>
            {(Object.keys(RECURRENCE_LABELS) as ExpenseRecurrence[]).map((r) => (
              <option key={r} value={r}>
                {RECURRENCE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3 max-[599px]:grid-cols-1">
        <Field label="Titre concerné" hint="Vide = frais de structure." name="productSlug">
          <Select name="productSlug" defaultValue={expense?.productSlug ?? ""}>
            <option value="">Aucun (frais de structure)</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Exemplaires couverts" hint="Pour l'amortir à l'unité. 0 = sans objet." name="units">
          <Input name="units" type="number" min="0" step="1" defaultValue={expense?.units ? String(expense.units) : "0"} />
        </Field>
        <Field label="Justificatif" hint="Une pièce de la bibliothèque de documents." name="documentId">
          <Select name="documentId" defaultValue={expense?.documentId ?? ""}>
            <option value="">Aucun</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Note" name="note">
        <Textarea name="note" defaultValue={expense?.note ?? ""} maxLength={500} placeholder="Ce dont vous vous souviendrez utilement : numéro de devis, ce que couvre exactement la facture…" />
      </Field>
    </>
  );
}
