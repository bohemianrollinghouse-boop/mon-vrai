import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, Input, PageHeader } from "@/components/admin/ui";
import { deleteMediaAction, updateMediaAltAction, uploadMediaAction } from "@/lib/admin/actions/media";
import { listMedia } from "@/lib/db/media";

export const dynamic = "force-dynamic";

/*
 * Médiathèque : envoi en haut, grille en dessous. Chaque vignette expose son URL à
 * copier (c'est ainsi qu'on place une image dans les contenus et l'éditeur), son texte
 * alternatif éditable, et sa suppression.
 */
export default async function MediaPage() {
  const media = await listMedia(300);

  return (
    <>
      <PageHeader title="Médias" subtitle={`${media.length} fichiers. Copiez l'URL d'une image pour l'utiliser dans un contenu.`} />

      <Card title="Ajouter des fichiers" className="mb-6">
        <ActionForm action={uploadMediaAction} submitLabel="Envoyer">
          <div className="grid grid-cols-[1fr_1fr] gap-4 max-[749px]:grid-cols-1">
            <Field label="Fichiers" hint="Images (JPEG, PNG, WebP, AVIF, SVG), vidéos MP4/WebM, PDF. 40 Mo max chacun." name="files">
              <input type="file" name="files" multiple accept="image/*,video/mp4,video/webm,application/pdf" className="text-sm" required />
            </Field>
            <Field label="Texte alternatif" hint="Appliqué à tous les fichiers envoyés ; modifiable ensuite.">
              <Input name="alt" />
            </Field>
          </div>
        </ActionForm>
      </Card>

      {media.length === 0 ? (
        <p className="rounded-card bg-white p-6 text-sm text-muted">Aucun média.</p>
      ) : (
        <div className="grid grid-cols-4 gap-4 max-[1199px]:grid-cols-3 max-[899px]:grid-cols-2 max-[479px]:grid-cols-1">
          {media.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 rounded-card bg-white p-3">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-paper">
                {m.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette admin
                  <img src={m.url} alt={m.alt} className="h-full w-full object-cover" loading="lazy" />
                ) : m.mime.startsWith("video/") ? (
                  <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-subtle">{m.mime}</span>
                )}
              </div>
              <div className="flex flex-col gap-1 text-xs text-subtle">
                <span className="truncate font-semibold text-ink" title={m.path}>
                  {m.path.split("/").pop()}
                </span>
                <span>
                  {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
                  {new Date(m.createdAt).toLocaleDateString("fr-FR")}
                </span>
                <input
                  readOnly
                  value={m.url}
                  aria-label="URL du fichier"
                  onFocus={undefined}
                  className="w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-[0.6875rem] text-ink"
                />
              </div>
              <ActionForm action={updateMediaAltAction} submitLabel="OK" className="gap-2 [&>div]:border-0 [&>div]:pt-0">
                <input type="hidden" name="id" value={m.id} />
                <Input name="alt" defaultValue={m.alt} placeholder="Texte alternatif" aria-label="Texte alternatif" className="text-xs" />
              </ActionForm>
              <ActionForm action={deleteMediaAction} submitLabel="Supprimer" confirm="Supprimer ce fichier ? Les pages qui l'utilisent afficheront une image manquante." className="gap-0 [&>div]:border-0 [&>div]:pt-0 [&_button]:bg-danger-bg [&_button]:text-danger">
                <input type="hidden" name="id" value={m.id} />
              </ActionForm>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
