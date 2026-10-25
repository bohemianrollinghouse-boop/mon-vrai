import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmitSelect";
import { Card, Field, FilterPills, Input, PageHeader } from "@/components/admin/ui";
import { deleteMediaAction, setMediaFolderAction, updateMediaAltAction, uploadMediaAction } from "@/lib/admin/actions/media";
import { runMediaBackfillAction } from "@/lib/admin/actions/media-backfill";
import { MediaBackfill } from "@/components/admin/MediaBackfill";
import { listAllDeliverables } from "@/lib/db/deliverables";
import { listMedia, mediaFolders } from "@/lib/db/media";

export const dynamic = "force-dynamic";

/*
 * Médiathèque : envoi en haut, grille en dessous. Chaque vignette expose son URL à
 * copier (c'est ainsi qu'on place une image dans les contenus et l'éditeur), son texte
 * alternatif éditable, son dossier et sa suppression.
 *
 * Les DOSSIERS sont un rangement d'écran, pas un rangement de coffre : un libellé sur
 * la fiche, et le fichier ne bouge jamais. Ce qu'un partenaire remet y arrive tout seul
 * sous son nom (voir db/deliverables.recordDeliverable) ; le « fonds commun » reste ce
 * qu'on a constitué soi-même pour le site.
 */
export default async function MediaPage({ searchParams }: PageProps<"/admin/medias">) {
  const [sp, all, contents] = await Promise.all([searchParams, listMedia(300), listAllDeliverables().catch(() => [])]);
  /* Les contenus de campagne qui n'ont pas encore rejoint la médiathèque : ceux déposés
     avant que le versement ne devienne automatique. */
  const pending = contents.filter((d) => !d.mediaId).length;
  const folders = mediaFolders(all);
  const wanted = typeof sp.dossier === "string" ? sp.dossier : "";
  /* « commun » n'est pas un dossier : c'est ce qui n'en a aucun. */
  const media = wanted === "commun" ? all.filter((m) => !m.folder) : wanted ? all.filter((m) => m.folder === wanted) : all;
  const common = all.filter((m) => !m.folder).length;

  return (
    <>
      <PageHeader title="Médias" subtitle={`${all.length} fichiers. Copiez l'URL d'une image pour l'utiliser dans un contenu.`} />

      {/* Le rattrapage tourne tout seul : ce n'est pas un geste à demander. */}
      <MediaBackfill pending={pending} run={runMediaBackfillAction} />

      {folders.length > 0 && (
        <FilterPills
          items={[
            { href: "/admin/medias", label: "Tout", count: all.length, active: !wanted },
            { href: "/admin/medias?dossier=commun", label: "Fonds commun", count: common, active: wanted === "commun" },
            ...folders.map((f) => ({
              href: `/admin/medias?dossier=${encodeURIComponent(f.name)}`,
              label: f.name,
              count: f.count,
              active: wanted === f.name,
            })),
          ]}
        />
      )}

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
        <p className="rounded-card bg-surface p-6 text-sm text-muted">
          {wanted ? "Aucun média dans ce dossier." : "Aucun média."}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-4 max-[1199px]:grid-cols-3 max-[899px]:grid-cols-2 max-[479px]:grid-cols-1">
          {media.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 rounded-card bg-surface p-3">
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
                {/* Son dossier, modifiable sur place : la liste se range à mesure. */}
                <ActionForm action={setMediaFolderAction} hideFooter className="!gap-0">
                  <input type="hidden" name="id" value={m.id} />
                  <AutoSubmitSelect
                    name="folder"
                    label={`Dossier de ${m.path.split("/").pop()}`}
                    value={m.folder}
                    options={[
                      { value: "", label: "Fonds commun" },
                      ...folders.filter((f) => f.name !== m.folder).map((f) => ({ value: f.name, label: f.name })),
                      ...(m.folder && !folders.some((f) => f.name === m.folder) ? [{ value: m.folder, label: m.folder }] : []),
                    ]}
                  />
                </ActionForm>
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
