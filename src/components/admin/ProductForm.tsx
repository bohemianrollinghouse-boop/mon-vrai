import { ActionForm } from "@/components/admin/ActionForm";
import { ImageList } from "@/components/admin/ImageList";
import { RichEditor } from "@/components/admin/RichEditor";
import { ButtonLink, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/admin/ui";
import { deleteProductAction, saveProductAction } from "@/lib/admin/actions/products";
import type { Product } from "@/lib/domain/types";

/*
 * Formulaire produit, partagé entre création et modification. Composant serveur : il
 * ne fait que disposer les champs ; ActionForm, ImageList et RichEditor portent le peu
 * d'interactivité nécessaire.
 */
export function ProductForm({ product }: { product: Product | null }) {
  const p = product;
  return (
    <ActionForm
      action={saveProductAction}
      submitLabel={p ? "Enregistrer" : "Créer le produit"}
      secondary={
        <>
          <ButtonLink href="/admin/produits" tone="ghost">
            Retour à la liste
          </ButtonLink>
          {p && (
            <ButtonLink href={`/livres/${p.slug}`} tone="ghost" target="_blank">
              Voir sur le site ↗
            </ButtonLink>
          )}
        </>
      }
    >
      <>
        <input type="hidden" name="originalSlug" value={p?.slug ?? ""} />
        <div className="grid grid-cols-[2fr_1fr] gap-6 max-[899px]:grid-cols-1">
          <div className="flex flex-col gap-6">
            <Card title="Livre">
              <div className="flex flex-col gap-4">
                <Field label="Titre" name="title">
                  <Input name="title" defaultValue={p?.title ?? ""} required maxLength={120} />
                </Field>
                <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                  <Field label="Surtitre" hint="Ex. « 6–18 mois »." name="ageLabel">
                    <Input name="ageLabel" defaultValue={p?.ageLabel ?? "6–18 mois"} />
                  </Field>
                  <Field label="Adresse (slug)" hint="Vide = généré depuis le titre." name="slug">
                    <Input name="slug" defaultValue={p?.slug ?? ""} placeholder="le-visage" />
                  </Field>
                </div>
                <Field label="Accroche" hint="Une phrase sous le titre." name="subtitle">
                  <Input name="subtitle" defaultValue={p?.subtitle ?? ""} maxLength={200} />
                </Field>
                <Field label="Contenu du livre" hint="Un objet par ligne (ou séparés par des virgules). Affiché sur les cartes : « la pomme, la clémentine et le kiwi »." name="items">
                  <Textarea name="items" defaultValue={p?.items.join("\n") ?? ""} rows={4} />
                </Field>
              </div>
            </Card>

            <Card title="Description">
              <RichEditor name="descriptionHtml" initialHtml={p?.descriptionHtml ?? ""} htmlOnly />
            </Card>

            <Card title="Images">
              <ImageList initial={p?.images ?? []} />
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card title="Publication">
              <div className="flex flex-col gap-4">
                <Field label="Statut">
                  <Select name="status" defaultValue={p?.status ?? "draft"}>
                    <option value="draft">Brouillon</option>
                    <option value="published">Publié</option>
                  </Select>
                </Field>
                <Field label="Ordre dans le catalogue" hint="0 en premier." name="position">
                  <Input name="position" type="number" defaultValue={p?.position ?? 0} />
                </Field>
              </div>
            </Card>

            <Card title="Prix et stock">
              <div className="flex flex-col gap-4">
                <Field label="Prix (€)" name="price">
                  <Input name="price" inputMode="decimal" defaultValue={p ? (p.price / 100).toFixed(2).replace(".", ",") : "10,00"} required />
                </Field>
                <Field label="Prix barré (€)" hint="Vide si aucun." name="compareAtPrice">
                  <Input name="compareAtPrice" inputMode="decimal" defaultValue={p?.compareAtPrice ? (p.compareAtPrice / 100).toFixed(2).replace(".", ",") : ""} />
                </Field>
                <Checkbox name="stockTracked" label="Suivre le stock" defaultChecked={p ? p.stock !== null : false} />
                <Field label="Quantité en stock" hint="Ignorée si le stock n'est pas suivi." name="stock">
                  <Input name="stock" type="number" min={0} defaultValue={p?.stock ?? 0} />
                </Field>
                <Field label="ISBN" name="isbn">
                  <Input name="isbn" defaultValue={p?.isbn ?? ""} />
                </Field>
              </div>
            </Card>

            <Card title="Précommande">
              <div className="flex flex-col gap-4">
                <Checkbox name="preorderEnabled" label="En précommande" defaultChecked={p?.preorder.enabled ?? false} />
                <Field label="Expédition à partir du" name="preorderShipFrom">
                  <Input name="preorderShipFrom" type="date" defaultValue={p?.preorder.shipFrom ?? ""} />
                </Field>
              </div>
            </Card>

            <Card title="Présentation">
              <div className="flex flex-col gap-4">
                <Field label="Pastille">
                  <Select name="badge" defaultValue={p?.badge ?? "none"}>
                    <option value="none">Aucune</option>
                    <option value="new">Nouveauté</option>
                    <option value="reissue">Nouvelle édition</option>
                  </Select>
                </Field>
                <Field label="Teinte de la vignette">
                  <Select name="tint" defaultValue={p?.tint ?? "green"}>
                    <option value="green">Vert</option>
                    <option value="blue">Bleu</option>
                    <option value="pink">Rose</option>
                    <option value="sand">Sable</option>
                  </Select>
                </Field>
              </div>
            </Card>

            <Card title="SEO">
              <div className="flex flex-col gap-4">
                <Field label="Titre" hint="Vide = titre du livre." name="seoTitle">
                  <Input name="seoTitle" defaultValue={p?.seo.title ?? ""} maxLength={70} />
                </Field>
                <Field label="Description" hint="Vide = accroche." name="seoDescription">
                  <Textarea name="seoDescription" defaultValue={p?.seo.description ?? ""} maxLength={200} rows={3} />
                </Field>
              </div>
            </Card>
          </div>
        </div>
      </>
    </ActionForm>
  );
}

export function DeleteProductForm({ slug, title }: { slug: string; title: string }) {
  return (
    <ActionForm action={deleteProductAction} submitLabel="Supprimer définitivement" confirm={`Supprimer « ${title} » ? Cette action est irréversible.`}>
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm text-muted">Les commandes passées gardent leur copie du titre et du prix : elles ne sont pas affectées.</p>
    </ActionForm>
  );
}

