import { ActionForm } from "@/components/admin/ActionForm";
import { ImageList } from "@/components/admin/ImageList";
import { ItemsEditor } from "@/components/admin/ItemsEditor";
import { RichEditor } from "@/components/admin/RichEditor";
import { Button, ButtonLink, Card, Field, Input, PageHeader, Segmented, Select, Switch, Textarea } from "@/components/admin/ui";
import { deleteProductAction, saveProductAction } from "@/lib/admin/actions/products";
import type { Product } from "@/lib/domain/types";

/*
 * Fiche produit, d'après la maquette : en-tête avec « Aperçu » et « Enregistrer »,
 * colonne principale (titre, description, contenu du livre, SEO), colonne latérale
 * (statut, précommande, pastille, photos, prix & stock). Composant serveur : il ne fait
 * que disposer les champs ; ActionForm, ImageList, ItemsEditor et RichEditor portent
 * le peu d'interactivité nécessaire.
 */
export function ProductForm({ product }: { product: Product | null }) {
  const p = product;
  const euros = (c?: number) => (c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));
  const formId = "product-form";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/produits", label: "Produits" }}
        title={p ? p.title : "Nouveau produit"}
        subtitle={p ? `Modifié le ${new Date(p.updatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Créé en brouillon tant que vous ne le mettez pas en ligne."}
        actions={
          <>
            {p && (
              <ButtonLink href={`/livres/${p.slug}`} target="_blank" tone="secondary">
                Aperçu ↗
              </ButtonLink>
            )}
            <Button form={formId} tone="primary">
              {p ? "Enregistrer" : "Créer le produit"}
            </Button>
          </>
        }
      />

      <ActionForm id={formId} action={saveProductAction} hideFooter>
        <input type="hidden" name="originalSlug" value={p?.slug ?? ""} />
        <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
          <div className="flex flex-col gap-3">
            <Card>
              <Field label="Titre" name="title">
                <Input name="title" defaultValue={p?.title ?? ""} required maxLength={120} className="!text-[0.9375rem] !font-bold" />
              </Field>
              <div className="grid grid-cols-2 gap-3 max-[749px]:grid-cols-1">
                <Field label="Surtitre" hint="Ex. « 6–18 mois »." name="ageLabel">
                  <Input name="ageLabel" defaultValue={p?.ageLabel ?? "6–18 mois"} />
                </Field>
                <Field label="Adresse (slug)" hint="Vide = généré depuis le titre." name="slug">
                  <Input name="slug" defaultValue={p?.slug ?? ""} placeholder="le-visage" />
                </Field>
              </div>
              <Field label="Sous-titre (une phrase)" name="subtitle">
                <Input name="subtitle" defaultValue={p?.subtitle ?? ""} maxLength={200} className="!font-medium" />
              </Field>
            </Card>

            <Card title={<span className="text-[0.8125rem]">Description</span>} aside={<span className="text-[0.6875rem] font-semibold text-subtle">Éditeur visuel · s'affiche sur la page produit</span>} className="!gap-3">
              <RichEditor name="descriptionHtml" initialHtml={p?.descriptionHtml ?? ""} htmlOnly />
            </Card>

            <Card title={<span className="text-[0.8125rem]">Contenu du livre</span>} aside={<span className="text-[0.6875rem] font-semibold text-subtle">Affiché sur les cartes : « la pomme, la clémentine et le kiwi »</span>}>
              <ItemsEditor initial={p?.items ?? []} />
            </Card>

            <Card title={<span className="text-[0.8125rem]">Référencement (SEO)</span>}>
              <Field label="Titre de page" hint="Vide = titre du livre." name="seoTitle">
                <Input name="seoTitle" defaultValue={p?.seo.title ?? ""} maxLength={70} placeholder={p ? `${p.title} — imagier 6–18 mois` : ""} className="!font-medium" />
              </Field>
              <Field label="Description" hint="Vide = sous-titre." name="seoDescription">
                <Textarea name="seoDescription" defaultValue={p?.seo.description ?? ""} maxLength={200} rows={2} className="!font-medium" />
              </Field>
              <div className="flex flex-col gap-1.5 text-[0.8125rem] font-bold">
                <span className="text-xs font-semibold text-subtle">URL</span>
                <span className="rounded-[14px] bg-paper px-4 py-3.5 text-sm font-medium text-muted">
                  monvrai.fr/livres/<span className="font-bold text-ink">{p?.slug ?? "…"}</span>
                </span>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <Card title={<span className="text-[0.8125rem]">Statut</span>}>
              <Segmented
                name="status"
                defaultValue={p?.status ?? "draft"}
                options={[
                  { value: "published", label: "En ligne" },
                  { value: "draft", label: "Brouillon" },
                ]}
              />
              <Switch name="preorderEnabled" label="Précommande" defaultChecked={p?.preorder.enabled ?? false} />
              <Field label="Expédition à partir du" hint="Vide = date des réglages." name="preorderShipFrom">
                <Input name="preorderShipFrom" type="date" defaultValue={p?.preorder.shipFrom ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pastille">
                  <Select name="badge" defaultValue={p?.badge ?? "none"}>
                    <option value="none">Aucune</option>
                    <option value="new">Nouveauté</option>
                    <option value="reissue">Nouvelle édition</option>
                  </Select>
                </Field>
                <Field label="Teinte" hint="Fond des vignettes.">
                  <Select name="tint" defaultValue={p?.tint ?? "green"}>
                    <option value="green">Vert</option>
                    <option value="blue">Bleu</option>
                    <option value="pink">Rose</option>
                    <option value="sand">Sable</option>
                  </Select>
                </Field>
              </div>
              <Field label="Ordre dans le catalogue" hint="0 en premier." name="position">
                <Input name="position" type="number" defaultValue={p?.position ?? 0} />
              </Field>
            </Card>

            <Card title={<span className="text-[0.8125rem]">Photos</span>}>
              <ImageList initial={p?.images ?? []} tint={p?.tint ?? "sand"} />
            </Card>

            <Card title={<span className="text-[0.8125rem]">Prix &amp; stock</span>}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prix TTC (€)" name="price">
                  <Input name="price" inputMode="decimal" defaultValue={p ? euros(p.price) : "10,00"} required className="!text-[0.9375rem] !font-bold" />
                </Field>
                <Field label="Prix barré (€)" hint="Optionnel." name="compareAtPrice">
                  <Input name="compareAtPrice" inputMode="decimal" defaultValue={euros(p?.compareAtPrice)} placeholder="—" />
                </Field>
              </div>
              <Switch name="stockTracked" label="Suivre le stock" hint="Décoché : vente illimitée." defaultChecked={p ? p.stock !== null : false} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stock" name="stock">
                  <Input name="stock" type="number" min={0} defaultValue={p?.stock ?? 0} className="!text-[0.9375rem] !font-bold" />
                </Field>
                <Field label="ISBN" name="isbn">
                  <Input name="isbn" defaultValue={p?.isbn ?? ""} />
                </Field>
              </div>
              <span className="text-[0.6875rem] leading-relaxed text-subtle">Le stock est décrémenté au paiement. Le seuil « stock bas » se règle dans Paramètres.</span>
            </Card>
          </div>
        </div>
      </ActionForm>

      {p && (
        <ActionForm action={deleteProductAction} submitLabel="Supprimer ce produit" submitTone="ghost" confirm={`Supprimer « ${p.title} » ? Cette action est irréversible.`} className="items-start px-2 [&_button]:!px-0 [&_button]:text-xs [&_button]:!font-semibold [&_button]:text-accent" footerNote="Les commandes passées gardent leur copie du titre et du prix.">
          <input type="hidden" name="slug" value={p.slug} />
        </ActionForm>
      )}
    </>
  );
}
