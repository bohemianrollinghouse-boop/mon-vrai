import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { RichEditor } from "@/components/admin/RichEditor";
import { ButtonLink, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/admin/ui";
import { deletePageAction, savePageAction } from "@/lib/admin/actions/pages";
import { getPage } from "@/lib/db/pages";

export const dynamic = "force-dynamic";

export default async function PageEdit({ params }: PageProps<"/admin/pages/[slug]">) {
  const { slug } = await params;
  const isNew = slug === "nouvelle";
  const page = isNew ? null : await getPage(slug);
  if (!isNew && !page) notFound();

  return (
    <>
      <PageHeader title={page ? page.title : "Nouvelle page"} subtitle={page ? `/pages/${page.slug}` : "Ex. : Livraison & retours, Qui sommes-nous, Presse…"} />
      <ActionForm
        action={savePageAction}
        submitLabel={page ? "Enregistrer" : "Créer la page"}
        secondary={
          <>
            <ButtonLink href="/admin/pages" tone="ghost">
              Retour à la liste
            </ButtonLink>
            {page?.status === "published" && (
              <ButtonLink href={`/pages/${page.slug}`} tone="ghost" target="_blank">
                Voir sur le site ↗
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="grid grid-cols-[2fr_1fr] gap-6 max-[899px]:grid-cols-1">
          <input type="hidden" name="originalSlug" value={page?.slug ?? ""} />
          <div className="flex flex-col gap-6">
            <Card title="Contenu">
              <div className="flex flex-col gap-4">
                <Field label="Titre" name="title">
                  <Input name="title" defaultValue={page?.title ?? ""} required maxLength={120} />
                </Field>
                <RichEditor name="body" initialHtml={page?.body.html ?? ""} initialJson={page?.body.json ?? undefined} />
              </div>
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card title="Publication">
              <div className="flex flex-col gap-4">
                <Field label="Statut">
                  <Select name="status" defaultValue={page?.status ?? "draft"}>
                    <option value="draft">Brouillon</option>
                    <option value="published">Publiée</option>
                  </Select>
                </Field>
                <Field label="Adresse (slug)" hint="Vide = générée depuis le titre." name="slug">
                  <Input name="slug" defaultValue={page?.slug ?? ""} placeholder="livraison-et-retours" />
                </Field>
              </div>
            </Card>
            <Card title="SEO">
              <div className="flex flex-col gap-4">
                <Field label="Titre" name="seoTitle">
                  <Input name="seoTitle" defaultValue={page?.seo.title ?? ""} maxLength={70} />
                </Field>
                <Field label="Description" name="seoDescription">
                  <Textarea name="seoDescription" defaultValue={page?.seo.description ?? ""} maxLength={200} rows={3} />
                </Field>
              </div>
            </Card>
          </div>
        </div>
      </ActionForm>

      {page && (
        <Card title="Zone dangereuse" className="mt-8 border border-danger-bg">
          <ActionForm action={deletePageAction} submitLabel="Supprimer la page" confirm={`Supprimer « ${page.title} » ?`}>
            <input type="hidden" name="slug" value={page.slug} />
            <p className="text-sm text-muted">Les menus qui pointent vers cette page afficheront un lien mort : pensez à les mettre à jour.</p>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
