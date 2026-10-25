import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { ButtonLink, Card, Field, Input, PageHeader, Pill, Select, Tile } from "@/components/admin/ui";
import { MediaChoice } from "@/components/admin/MediaChoice";
import { saveGuideAction } from "@/lib/admin/actions/guide";
import { listMedia } from "@/lib/db/media";
import { getSettings } from "@/lib/db/settings";
import { CHILD_POLICY_LABELS, INSPIRATION_SLOTS, SCENE_SLOTS, VIDEO_SLOTS, guideMissing, guideView, type Slot } from "@/lib/guide/content";
import type { Media } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Le guide de création de contenu : ses exemples.
 *
 * Seuls les FICHIERS se règlent ici. Le texte du guide est écrit dans
 * `lib/guide/content.ts` : il ne change qu'avec notre façon de travailler, et le faire
 * passer par un formulaire reviendrait à demander de ressaisir un mode d'emploi à
 * chaque retouche.
 *
 * Les emplacements sont nommés et leur légende est écrite avec eux : on choisit l'image
 * qui vient à une place, jamais la place. D'où des listes déroulantes de la médiathèque
 * plutôt qu'un champ d'adresse — une URL tapée à la main vieillit mal, et personne ne
 * la corrige.
 */
export default async function GuideSettingsPage() {
  const [settings, media] = await Promise.all([getSettings(), listMedia(300)]);
  const guide = settings.guide;
  const view = guideView(guide);
  const missing = guideMissing(guide);

  const images = media.filter((m) => m.mime.startsWith("image/"));
  const videos = media.filter((m) => m.mime.startsWith("video/"));
  const chosen = (list: { key: string; url: string }[], key: string) => list.find((s) => s.key === key)?.url ?? "";

  return (
    <>
      <PageHeader
        title="Guide de création de contenu"
        subtitle="Les exemples que les partenaires voient avant de produire. Le texte du guide est écrit dans le code ; ici se règlent les photos et les vidéos."
        actions={
          <ButtonLink href="/guide-contenu" tone="secondary">
            Voir le guide →
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-3 gap-3 max-[899px]:grid-cols-1">
        <Tile
          tone={missing > 0 ? "sand" : "green"}
          label="Emplacements à remplir"
          value={missing}
          note={missing > 0 ? "ils s'affichent en attente sur le guide" : "tout est illustré"}
        />
        <Tile label="Vidéos posées" value={`${view.videos.filter((v) => v.url).length} / ${VIDEO_SLOTS.length}`} note={`${videos.length} dans la médiathèque`} />
        <Tile label="Adresse du guide" value="/guide-contenu" note="à coller dans le champ Lien d'un contrat" />
      </div>

      {videos.length === 0 && (
        <p className="rounded-card bg-tint-blue px-6 py-5 text-[0.8125rem] leading-relaxed text-tint-blue-ink">
          Aucune vidéo dans la médiathèque pour l&apos;instant. Déposez vos rushes dans{" "}
          <Link href="/admin/medias" className="font-bold underline">
            Médias
          </Link>{" "}
          — MP4 ou WebM — puis revenez les choisir ici. Un emplacement vide s&apos;affiche « Vidéo à venir » sur le guide :
          il ne casse rien.
        </p>
      )}

      <ActionForm action={saveGuideAction} submitLabel="Enregistrer le guide">
        <Card title="Ce que le guide annonce">
          <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
            <Field label="Durée minimale d'un plan" hint="En secondes. Le guide l'écrit dans sa première carte." name="rushSeconds">
              <Input name="rushSeconds" type="number" min={5} max={60} defaultValue={guide.rushSeconds} />
            </Field>
            <Field label="L'enfant à l'image" hint="Trois phrases sont écrites ; celle-ci paraît." name="childPolicy">
              <Select name="childPolicy" defaultValue={guide.childPolicy}>
                {(Object.keys(CHILD_POLICY_LABELS) as (keyof typeof CHILD_POLICY_LABELS)[]).map((k) => (
                  <option key={k} value={k}>
                    {CHILD_POLICY_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="rounded-xl bg-paper px-4 py-3 text-[0.6875rem] leading-relaxed text-subtle">
            « {view.childNote} »
          </p>
        </Card>

        <Card title="Photo d'ouverture">
          <Field label="En haut du guide" hint="Une scène large, lumière naturelle, fond simple." name="hero">
            <MediaChoice name="hero" options={images} value={guide.hero} kind="image" />
          </Field>
        </Card>

        <Card title="Pour s'inspirer">
          <p className="-mt-1 text-[0.8125rem] leading-relaxed text-subtle">
            Trois photos sous le chapitre de la lumière. Leur légende est écrite avec l&apos;emplacement : vous choisissez
            l&apos;image, pas le texte.
          </p>
          {INSPIRATION_SLOTS.map((slot) => (
            <SlotField key={slot.key} prefix="inspirations" slot={slot} options={images} value={chosen(view.inspirations, slot.key)} />
          ))}
        </Card>

        <Card title="Mises en scène">
          <p className="-mt-1 text-[0.8125rem] leading-relaxed text-subtle">
            Quatre photos. Les deux autres mises en scène — l&apos;animal vivant, la découverte sensorielle — sont des
            pavés de texte et n&apos;attendent pas d&apos;image.
          </p>
          {SCENE_SLOTS.map((slot) => (
            <SlotField key={slot.key} prefix="scenes" slot={slot} options={images} value={chosen(view.scenes, slot.key)} />
          ))}
        </Card>

        <Card title="Exemples vidéo" aside={<Pill tone={view.videos.every((v) => v.url) ? "ok" : "warn"}>{view.videos.filter((v) => v.url).length} sur {VIDEO_SLOTS.length}</Pill>}>
          <p className="-mt-1 text-[0.8125rem] leading-relaxed text-subtle">
            Quatre rushes, un par idée. Choisissez-les dans la médiathèque ; l&apos;image d&apos;attente évite de charger
            la vidéo entière avant qu&apos;on la lance.
          </p>
          {VIDEO_SLOTS.map((slot) => {
            const current = view.videos.find((v) => v.key === slot.key);
            return (
              <div key={slot.key} className="flex flex-col gap-2.5 rounded-card bg-paper p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.8125rem] font-extrabold">{slot.title}</span>
                  <span className="text-[0.6875rem] leading-relaxed text-subtle">{slot.caption}</span>
                </div>
                <Field label="Vidéo" name={`videos.${slot.key}.url`}>
                  <MediaChoice name={`videos.${slot.key}.url`} options={videos} value={current?.url ?? ""} kind="video" emptyLabel="À venir" />
                </Field>
                <Field label="Image d'attente" hint="Facultative : elle s'affiche avant qu'on lance la vidéo." name={`videos.${slot.key}.poster`}>
                  <MediaChoice name={`videos.${slot.key}.poster`} options={images} value={current?.poster ?? ""} kind="image" />
                </Field>
              </div>
            );
          })}
        </Card>
      </ActionForm>

      <p className="text-xs leading-relaxed text-subtle">
        Le guide s&apos;ouvre à <strong className="text-ink">/guide-contenu</strong>. Collez cette adresse dans le champ
        « Lien » de l&apos;annexe d&apos;un contrat (Contrats → Annexe remise au créateur) : le créateur l&apos;ouvrira au
        moment de signer, et la retrouvera dans son espace. La page n&apos;est pas référencée par les moteurs de
        recherche — elle s&apos;atteint par son lien, pas par une requête.
      </p>
    </>
  );
}

/** Un emplacement de photo : ce qu'il illustre, sa légende, et l'image qu'on y pose. */
function SlotField({ prefix, slot, options, value }: { prefix: string; slot: Slot; options: Media[]; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-paper p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[0.8125rem] font-extrabold">{slot.title || slot.hint}</span>
        <span className="text-[0.6875rem] leading-relaxed text-subtle">{slot.caption}</span>
      </div>
      <MediaChoice name={`${prefix}.${slot.key}`} options={options} value={value} kind="image" emptyLabel="En attente" />
    </div>
  );
}
