import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { RichEditor } from "@/components/admin/RichEditor";
import { ButtonLink, Card, Field, Input, PageHeader } from "@/components/admin/ui";
import { deletePolicyAction, savePolicyAction } from "@/lib/admin/actions/policies";
import { getPolicy } from "@/lib/db/policies";

export const dynamic = "force-dynamic";

export default async function PolicyEdit({ params }: PageProps<"/admin/politiques/[handle]">) {
  const { handle } = await params;
  const isNew = handle === "nouvelle";
  const policy = isNew ? null : await getPolicy(handle);
  if (!isNew && !policy) notFound();

  return (
    <>
      <PageHeader title={policy ? policy.title : "Nouvelle page légale"} subtitle={policy ? `/informations/${policy.handle}` : undefined} />
      <ActionForm
        action={savePolicyAction}
        submitLabel={policy ? "Enregistrer" : "Créer"}
        secondary={
          <>
            <ButtonLink href="/admin/politiques" tone="ghost">
              Retour à la liste
            </ButtonLink>
            {policy && (
              <ButtonLink href={`/informations/${policy.handle}`} tone="ghost" target="_blank">
                Voir sur le site ↗
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="grid grid-cols-[2fr_1fr] gap-6 max-[899px]:grid-cols-1">
          <input type="hidden" name="originalHandle" value={policy?.handle ?? ""} />
          <Card title="Contenu">
            <div className="flex flex-col gap-4">
              <Field label="Titre" name="title">
                <Input name="title" defaultValue={policy?.title ?? ""} required maxLength={120} />
              </Field>
              <RichEditor name="body" initialHtml={policy?.body.html ?? ""} initialJson={policy?.body.json ?? undefined} />
            </div>
          </Card>
          <Card title="Affichage">
            <div className="flex flex-col gap-4">
              <Field label="Adresse" hint="Vide = générée depuis le titre." name="handle">
                <Input name="handle" defaultValue={policy?.handle ?? ""} />
              </Field>
              <Field label="Ordre dans le menu" hint="0 en premier." name="position">
                <Input name="position" type="number" defaultValue={policy?.position ?? 0} />
              </Field>
            </div>
          </Card>
        </div>
      </ActionForm>

      {policy && (
        <Card title="Zone dangereuse" className="mt-8 border border-danger-bg">
          <ActionForm action={deletePolicyAction} submitLabel="Supprimer" confirm={`Supprimer « ${policy.title} » ? Vérifiez d'abord vos obligations légales.`}>
            <input type="hidden" name="handle" value={policy.handle} />
            <p className="text-sm text-muted">Certaines pages sont obligatoires pour un site marchand (mentions légales, CGV, confidentialité).</p>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
