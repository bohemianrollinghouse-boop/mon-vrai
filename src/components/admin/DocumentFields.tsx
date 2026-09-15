import { DOC_KIND_LABELS } from "@/lib/admin/expense-ui";
import type { BusinessDoc, DocKind, Product } from "@/lib/domain/types";
import { Field } from "./Field";
import { Input, Select, Textarea } from "./ui";

/*
 * La fiche d'une pièce administrative, partagée par l'envoi et la modification. Le
 * FICHIER ne se change jamais après coup : un document reçu est ce qu'il est, et on
 * n'en substitue pas le contenu sous le même titre. Pour une nouvelle version, on
 * dépose une nouvelle pièce.
 */
export function DocumentFields({ doc, products }: { doc?: BusinessDoc; products: Product[] }) {
  return (
    <>
      {doc && <input type="hidden" name="id" value={doc.id} />}

      <div className="grid grid-cols-[1.6fr_1fr] gap-3 max-[749px]:grid-cols-1">
        <Field label="Titre" hint="Ce que vous chercherez dans deux ans." name="title">
          <Input name="title" defaultValue={doc?.title ?? ""} placeholder="Attestation de conformité EN 71 — Les fruits" maxLength={160} required />
        </Field>
        <Field label="Nature" name="kind">
          <Select name="kind" defaultValue={doc?.kind ?? "certification"}>
            {(Object.keys(DOC_KIND_LABELS) as DocKind[]).map((k) => (
              <option key={k} value={k}>
                {DOC_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2 max-[599px]:grid-cols-1">
        <Field label="Date du document" hint="Émission, signature, essai." name="issuedAt">
          <Input name="issuedAt" type="date" defaultValue={doc?.issuedAt ?? ""} />
        </Field>
        <Field label="Fin de validité" hint="Vide = sans échéance. Sinon, l'admin prévient avant." name="expiresAt">
          <Input name="expiresAt" type="date" defaultValue={doc?.expiresAt ?? ""} />
        </Field>
        <Field label="Titre concerné" hint="Vide = vaut pour toute la maison." name="productSlug">
          <Select name="productSlug" defaultValue={doc?.productSlug ?? ""}>
            <option value="">Aucun (toute la maison)</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Référence" hint="N° de rapport, de contrat, de facture." name="reference">
          <Input name="reference" defaultValue={doc?.reference ?? ""} maxLength={120} placeholder="RAP-2026-0147" />
        </Field>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-3 max-[749px]:grid-cols-1">
        <Field label="ISBN porté par la pièce" hint="Attribution AFNIL, dépôt légal. La clé est vérifiée." name="isbn">
          <Input name="isbn" defaultValue={doc?.isbn ?? ""} maxLength={20} placeholder="978-2-…" />
        </Field>
        <Field label="Note" name="note">
          <Textarea name="note" defaultValue={doc?.note ?? ""} maxLength={500} className="min-h-[3.5rem]" placeholder="Ce que la pièce couvre exactement, ce qu'il faudra refaire, qui l'a émise…" />
        </Field>
      </div>
    </>
  );
}
