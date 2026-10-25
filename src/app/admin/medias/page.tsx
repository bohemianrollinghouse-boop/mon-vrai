import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmitSelect";
import { Card, Field, FilterPills, Input, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { deleteMediaAction, setMediaFolderAction, updateMediaAltAction, uploadMediaAction } from "@/lib/admin/actions/media";
import { publishDeliverableAction, unpublishDeliverableAction } from "@/lib/admin/actions/deliverables";
import { filterShelf, isImage, isVideo, mediaShelf, shelfFolders, type ShelfItem } from "@/lib/admin/media-shelf";
import { listAllDeliverables } from "@/lib/db/deliverables";
import { listMedia } from "@/lib/db/media";
import { listInfluencers } from "@/lib/db/promos";

export const dynamic = "force-dynamic";

/*
 * Médias : tout ce qu'on possède en images et en vidéos, dans un seul écran.
 *
 * Il y a deux coffres, et il faut qu'il y en ait deux. `media/` est lisible par TOUT LE
 * MONDE — c'est ce qui permet à une photo produit de s'afficher sur la boutique, et le
 * mot de passe de l'administration n'y change rien : qui a l'adresse a le fichier.
 * `ugc/` est fermé, et garde ce que les créateurs nous confient.
 *
 * Ce qui n'avait pas lieu d'être double, c'est l'écran : on ne cherche pas une photo
 * « dans le coffre public » ou « dans le coffre privé », on cherche une photo. Les deux
 * listes se rejoignent donc ici, sans rien recopier — recopier, c'était publier.
 *
 * Les contenus de campagne portent la mention « Privé » et se rangent au nom de leur
 * créateur. Les rendre publics est un geste explicite, qui se défait.
 */

const NATURES = [
  { key: "", label: "Tout" },
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Vidéos" },
  { key: "prives", label: "Reçus des créateurs" },
];

export default async function MediaPage({ searchParams }: PageProps<"/admin/medias">) {
  const [sp, media, deliverables, influencers] = await Promise.all([
    searchParams,
    listMedia(300),
    listAllDeliverables().catch(() => []),
    listInfluencers().catch(() => []),
  ]);

  const all = mediaShelf({ media, deliverables, influencers });
  const folders = shelfFolders(all);
  const folder = typeof sp.dossier === "string" ? sp.dossier : "";
  const nature = typeof sp.nature === "string" ? sp.nature : "";
  const items = filterShelf(all, folder, nature);

  const common = all.filter((i) => !i.folder).length;
  const privateCount = all.filter((i) => i.kind === "content").length;
  const link = (next: { dossier?: string; nature?: string }) => {
    const params = new URLSearchParams();
    const d = next.dossier ?? folder;
    const n = next.nature ?? nature;
    if (d) params.set("dossier", d);
    if (n) params.set("nature", n);
    const q = params.toString();
    return q ? `/admin/medias?${q}` : "/admin/medias";
  };

  return (
    <>
      <PageHeader
        title="Médias"
        subtitle="Tout ce que vous possédez en photos et en vidéos. Ce que les créateurs vous remettent arrive ici tout seul, dans leur dossier."
      />

      <div className="grid grid-cols-3 gap-3 max-[899px]:grid-cols-1">
        <Tile label="Fichiers" value={all.length} note={`${all.filter((i) => isVideo(i.mime)).length} vidéos`} />
        <Tile tone="blue" label="Reçus des créateurs" value={privateCount} note="privés : eux seuls ne sont pas sur le web" />
        <Tile label="Dossiers" value={folders.length} note={`plus le fonds commun (${common})`} />
      </div>

      <div className="flex flex-col gap-2">
        <FilterPills items={NATURES.map((n) => ({ href: link({ nature: n.key }), label: n.label, active: nature === n.key }))} />
        {folders.length > 0 && (
          <FilterPills
            items={[
              { href: link({ dossier: "" }), label: "Tous les dossiers", count: all.length, active: !folder },
              { href: link({ dossier: "commun" }), label: "Fonds commun", count: common, active: folder === "commun" },
              ...folders.map((f) => ({ href: link({ dossier: f.name }), label: f.name, count: f.count, active: folder === f.name })),
            ]}
          />
        )}
      </div>

      <Card title="Ajouter des fichiers" className="mb-2">
        <ActionForm action={uploadMediaAction} submitLabel="Envoyer">
          <div className="grid grid-cols-[1fr_1fr] gap-4 max-[749px]:grid-cols-1">
            <Field label="Fichiers" hint="Images (JPEG, PNG, WebP, AVIF, SVG), vidéos MP4/WebM, PDF. 40 Mo max chacun." name="files">
              <input type="file" name="files" multiple accept="image/*,video/mp4,video/webm,application/pdf" className="text-sm" required />
            </Field>
            <Field label="Texte alternatif" hint="Appliqué à tous les fichiers envoyés ; modifiable ensuite.">
              <Input name="alt" />
            </Field>
          </div>
          <p className="text-[0.6875rem] leading-relaxed text-subtle">
            Ce qui est envoyé ici est <strong>destiné à paraître</strong> sur le site : son adresse est publique. Les
            contenus que vous recevez des créateurs, eux, se déposent sur leur campagne et restent privés.
          </p>
        </ActionForm>
      </Card>

      {items.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted">
          {folder || nature ? "Rien ici avec ces filtres." : "Aucun média."}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-4 max-[1199px]:grid-cols-3 max-[899px]:grid-cols-2 max-[479px]:grid-cols-1">
          {items.map((item) => (
            <Tile_ key={item.key} item={item} folders={folders} />
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-subtle">
        Les dossiers sont un rangement d&apos;écran : le fichier ne bouge pas du coffre, et l&apos;adresse d&apos;une image
        déjà publiée ne change jamais. Un contenu reçu d&apos;un créateur n&apos;a <strong>pas</strong> d&apos;adresse
        publique tant que vous ne l&apos;avez pas rendu public — c&apos;est ce qui le distingue du reste, et c&apos;est
        voulu : tout ce qu&apos;on reçoit n&apos;est pas destiné à paraître.
      </p>
    </>
  );
}

/** Une vignette. Les deux sortes se ressemblent, mais ne proposent pas la même chose. */
function Tile_({ item, folders }: { item: ShelfItem; folders: { name: string; count: number }[] }) {
  const content = item.kind === "content";

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-3">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-paper">
        {isImage(item.mime) ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette admin, source privée possible
          <img src={item.src} alt={item.alt} className="h-full w-full object-cover" loading="lazy" />
        ) : isVideo(item.mime) ? (
          /*
            Un navigateur ne peint pas toujours une image avec `preload="metadata"` : la
            vignette resterait noire, et une vidéo noire se confond avec une vidéo
            absente. On la rend donc lisible quoi qu'il arrive — la pastille dit que
            c'en est une, et le lecteur s'ouvre d'un clic.
          */
          <>
            <video src={`${item.src}#t=0.1`} muted playsInline preload="metadata" controls className="h-full w-full bg-ink object-contain" />
            <span className="pointer-events-none absolute right-2 top-2 rounded-pill bg-white/90 px-2.5 py-1 text-[0.625rem] font-bold text-ink">
              Vidéo
            </span>
          </>
        ) : (
          <span className="text-xs font-bold text-subtle">{item.mime}</span>
        )}
        {content && (
          <span className="absolute left-2 top-2">
            <Pill tone={item.mediaId ? "warn" : "blue"}>{item.mediaId ? "Public" : "Privé"}</Pill>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-subtle">
        <a href={item.src} target="_blank" rel="noreferrer noopener" className="truncate font-semibold text-ink underline decoration-line-warm hover:opacity-70" title={item.filename}>
          {item.filename}
        </a>
        <span>{new Date(item.at).toLocaleDateString("fr-FR")}</span>

        {content ? (
          <>
            <Link href={`/admin/influenceurs/${item.influencerId}/campagnes/${item.campaignId}`} className="w-fit font-semibold underline hover:opacity-70">
              Voir la campagne
            </Link>
            {/*
              Rendre public, c'est COPIER dans le coffre ouvert : le fichier reçu ne
              bouge pas, et le geste se défait sans rien perdre.
            */}
            <ActionForm
              action={item.mediaId ? unpublishDeliverableAction : publishDeliverableAction}
              submitLabel={item.mediaId ? "Retirer du public" : "Rendre public"}
              submitTone="ghost"
              className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-[0.6875rem]"
            >
              <input type="hidden" name="id" value={item.id} />
            </ActionForm>
          </>
        ) : (
          <>
            <ActionForm action={setMediaFolderAction} hideFooter className="!gap-0">
              <input type="hidden" name="id" value={item.id} />
              <AutoSubmitSelect
                name="folder"
                label={`Dossier de ${item.filename}`}
                value={item.folder}
                options={[
                  { value: "", label: "Fonds commun" },
                  ...folders.filter((f) => f.name !== item.folder).map((f) => ({ value: f.name, label: f.name })),
                  ...(item.folder && !folders.some((f) => f.name === item.folder) ? [{ value: item.folder, label: item.folder }] : []),
                ]}
              />
            </ActionForm>
            <input
              readOnly
              value={item.url}
              aria-label="URL du fichier"
              onFocus={undefined}
              className="w-full rounded-lg bg-paper px-2 py-1.5 text-[0.625rem] text-subtle outline-none"
            />
            <ActionForm action={updateMediaAltAction} hideFooter className="!gap-0">
              <input type="hidden" name="id" value={item.id} />
              <Input name="alt" defaultValue={item.alt} placeholder="Texte alternatif" className="!py-2 !text-xs" />
            </ActionForm>
            <ActionForm
              action={deleteMediaAction}
              submitLabel="Supprimer"
              submitTone="ghost"
              confirm={`Supprimer ${item.filename} ? Les pages qui l'utilisent afficheront un trou.`}
              className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-[0.6875rem] [&_button]:text-accent"
            >
              <input type="hidden" name="id" value={item.id} />
            </ActionForm>
          </>
        )}
      </div>
    </div>
  );
}
