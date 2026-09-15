import { CATEGORY_LABELS, DOC_KIND_LABELS, IN_CATEGORIES, METHOD_LABELS, OUT_CATEGORIES, RECURRENCE_LABELS, dayLabel, fileSize } from "@/lib/admin/expense-ui";
import { now } from "@/lib/db/helpers";
import type { BusinessDoc, Expense, ExpenseMethod, ExpenseRecurrence, Product } from "@/lib/domain/types";
import { dayKey } from "@/lib/stats/keys";
import { Field } from "./Field";
import { UrssafField } from "./UrssafField";
import { Checkbox, Input, Segmented, Select, Textarea } from "./ui";

/*
 * Les champs d'un mouvement d'argent, partagés par la saisie rapide de /admin/depenses
 * et la fiche /admin/depenses/<id> — un seul endroit à corriger le jour où un champ
 * s'ajoute. Composant serveur sans état : il se contente de poser des champs nommés,
 * que `saveExpenseAction` relit.
 *
 * Le poste est un seul menu, en deux groupes : mettre les entrées ailleurs obligerait à
 * du JavaScript pour suivre le sens choisi, alors qu'un <optgroup> le dit aussi bien.
 *
 * Les titres et les pièces sont des CASES, pas des menus : on en coche plusieurs — une
 * série d'essais couvre souvent tout le catalogue d'un coup —, et on voit du même coup
 * ce qui est retenu. Les groupes de cases ne passent pas par <Field>, qui est un <label>
 * : un label dans un label ne veut rien dire, et le clic finirait sur la mauvaise case.
 */
export function ExpenseFields({ expense, products, documents, urssafBp }: { expense?: Expense; products: Product[]; documents: BusinessDoc[]; urssafBp: number }) {
  // Le jour de Paris, pas celui d'UTC : passé minuit l'été, les deux ne sont plus le même.
  const today = dayKey(now());
  const chosenProducts = new Set(expense?.productSlugs ?? []);
  const chosenDocs = new Set(expense?.documentIds ?? []);
  // Les pièces déjà attachées d'abord : ce sont celles qu'on vient vérifier ou décrocher.
  const listed = [...documents].sort((a, b) => Number(chosenDocs.has(b.id)) - Number(chosenDocs.has(a.id)));

  return (
    <>
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2 max-[599px]:grid-cols-1">
        <Field label="Sens" hint="Les ventes du site sont comptées toutes seules." name="direction">
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

      {/*
       * Le choix se fait à la saisie, parce qu'aucune règle ne le devine à coup sûr : une
       * vente en salon cotise, un don ou un apport non, et les deux se rangent volontiers
       * sous le même poste. Coché par défaut : une entrée est une recette neuf fois sur dix.
       * Le bloc ne paraît que sur une entrée — voir UrssafField.
       */}
      <UrssafField bp={urssafBp} defaultChecked={expense ? expense.taxable : true} defaultDirection={expense?.direction ?? "out"} />

      <fieldset className="flex flex-col gap-2.5 rounded-[14px] bg-paper p-4">
        <legend className="px-1 text-[0.8125rem] font-bold">Titres concernés</legend>
        <span className="text-xs text-subtle">
          Cochez tous les livres que ce frais couvre — une norme CE, une série d'essais ou une commande d'ISBN en concerne souvent plusieurs. Le montant se répartit alors entre eux. Rien de coché : c'est un frais de
          structure, qui n'appartient à aucun titre.
        </span>
        {products.length === 0 ? (
          <span className="text-[0.8125rem] text-muted">Aucun titre au catalogue.</span>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 max-[899px]:grid-cols-2 max-[599px]:grid-cols-1">
            {products.map((p) => (
              <Checkbox key={p.slug} name="productSlugs" value={p.slug} defaultChecked={chosenProducts.has(p.slug)} label={p.title} />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 rounded-[14px] bg-paper p-4">
        <legend className="px-1 text-[0.8125rem] font-bold">Pièces justificatives</legend>
        <Field label="Ajouter des fichiers" hint="PDF, photo, tableur ou ZIP — 40 Mo chacun. Ils rejoignent la bibliothèque privée et restent modifiables dans Documents." name="files">
          <input type="file" name="files" multiple accept="application/pdf,image/*,text/csv,.doc,.docx,.xls,.xlsx,.zip" className="text-sm" />
        </Field>
        {listed.length > 0 && (
          <>
            <span className="text-[0.8125rem] font-bold">Ou rattacher une pièce déjà déposée</span>
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
              {listed.map((doc) => (
                <Checkbox
                  key={doc.id}
                  name="documentIds"
                  value={doc.id}
                  defaultChecked={chosenDocs.has(doc.id)}
                  label={`${doc.title} — ${DOC_KIND_LABELS[doc.kind]}${doc.issuedAt ? `, ${dayLabel(doc.issuedAt)}` : ""} · ${fileSize(doc.size)}`}
                />
              ))}
            </div>
          </>
        )}
      </fieldset>

      <Field label="Note" name="note">
        <Textarea name="note" defaultValue={expense?.note ?? ""} maxLength={500} placeholder="Ce dont vous vous souviendrez utilement : numéro de devis, ce que couvre exactement la facture…" />
      </Field>
    </>
  );
}
