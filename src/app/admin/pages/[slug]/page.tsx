import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { BlockEditor } from "@/components/admin/BlockEditor";
import { SeoFields } from "@/components/admin/SeoFields";
import { ButtonLink, Card, Field, Input, Notice, PageHeader, Pill, Select } from "@/components/admin/ui";
import { deletePageAction, restoreEditorialPageAction, savePageAction, savePageBlocksAction, savePageSeoAction, setHomePageAction } from "@/lib/admin/actions/pages";
import { toBlockData } from "@/lib/blocks/config";
import { EDITORIAL_PAGES, EDITORIAL_PHOTOS } from "@/lib/blocks/editorial-pages";
import { htmlToDocument } from "@/lib/blocks/from-html";
import { listMedia } from "@/lib/db/media";
import { getPage, listPages } from "@/lib/db/pages";
import type { Page } from "@/lib/domain/types";
import { siteUrl } from "@/lib/domain/page-metadata";
import { PINNED_SLUGS, pagePath } from "@/lib/domain/system-pages";
import { buildBlockMetadata } from "@/lib/blocks/metadata";

export const dynamic = "force-dynamic";

/*
 * Édition d'une page libre, de haut en bas : la publication, le contenu en blocs, le
 * référencement, la suppression. Trois enregistrements distincts — chacun n'écrit que
 * ce qu'il porte —, d'où trois boutons explicitement nommés. L'éditeur de blocs ne
 * peut pas être inclus dans un <form> (les boutons de Puck le soumettraient), c'est
 * ce qui impose de séparer publication et SEO de part et d'autre.
 *
 * Une page créée avant l'éditeur de blocs n'a qu'un corps de texte riche : il est
 * découpé en blocs à l'ouverture (htmlToDocument) et rien n'est réécrit en base tant
 * que le contenu n'a pas été enregistré.
 */
export default async function PageEdit({ params }: PageProps<"/admin/pages/[slug]">) {
  const { slug } = await params;
  const isNew = slug === "nouvelle";
  const [page, media, all] = await Promise.all([isNew ? null : getPage(slug), isNew ? [] : listMedia(300), listPages()]);
  // Les catégories déjà en usage, proposées en saisie : on en crée une en l'écrivant.
  const categories = [...new Set(all.map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  if (!isNew && !page) notFound();

  /* Page dont le premier contenu est écrit dans le code, et photos qui lui manquent. */
  const editorial = page ? EDITORIAL_PAGES[page.slug] : undefined;
  const missingPhotos = editorial ? EDITORIAL_PHOTOS.filter((n) => !media.some((m) => m.path.endsWith(`/${n}`))) : [];

  const metadata = page?.blocks ? await buildBlockMetadata(page) : {};
  const imported = !isNew && page !== null && !page.blocks && page.body.html.trim() !== "";
  const initial = page?.blocks ?? (page ? htmlToDocument(page.body.html, page.title) : { root: { props: {} }, content: [] });

  return (
    <>
      <PageHeader
        title={page ? page.title : "Nouvelle page"}
        subtitle={
          page ? (
            <span className="flex items-center gap-2">
              {page.home ? "/ (racine du site)" : pagePath(page.slug)}
              {page.home && <Pill tone="ok">Accueil</Pill>}
            </span>
          ) : (
            "Ex. : Livraison & retours, Qui sommes-nous, Presse…"
          )
        }
        back={{ href: "/admin/pages", label: "Toutes les pages" }}
        actions={
          page?.status === "published" ? (
            <ButtonLink href={page.home ? "/" : pagePath(page.slug)} tone="ghost" target="_blank">
              Voir sur le site ↗
            </ButtonLink>
          ) : undefined
        }
      />

      <ActionForm action={savePageAction} submitLabel={page ? "Enregistrer la publication" : "Créer la page"}>
        <input type="hidden" name="originalSlug" value={page?.slug ?? ""} />
        <Card title="Publication">
          <div className="grid grid-cols-[2fr_1fr_1fr_2fr] items-start gap-3 max-[1099px]:grid-cols-2 max-[749px]:grid-cols-1">
            <Field label="Titre" name="title">
              <Input name="title" defaultValue={page?.title ?? ""} required maxLength={120} className="!font-bold" />
            </Field>
            <Field label="Catégorie" hint="Regroupe la page dans la liste. Vide = « Sans catégorie »." name="category">
              <>
                <Input name="category" defaultValue={page?.category ?? ""} list="page-categories" maxLength={40} placeholder="Pages légales" />
                <datalist id="page-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            </Field>
            <Field label="Statut" name="status">
              <Select name="status" defaultValue={page?.status ?? "draft"}>
                <option value="draft">Brouillon</option>
                <option value="published">Publiée</option>
              </Select>
            </Field>
            <Field
              label="Adresse"
              hint={
                page?.home
                  ? "Cette page est servie à la racine du site."
                  : page && PINNED_SLUGS.has(page.slug)
                    ? "Adresse imposée : le site y renvoie en dur (panier, page 404, fiches livre)."
                    : "Chemin réel : « notre-histoire » donne /notre-histoire. Vide = depuis le titre."
              }
              name="slug"
            >
              <Input name="slug" defaultValue={page?.slug ?? ""} placeholder="livraison-et-retours" />
            </Field>
          </div>
        </Card>
      </ActionForm>

      {page && (
        <ActionForm
          action={setHomePageAction}
          submitLabel={page.home ? "Ne plus servir à la racine" : "Faire de cette page l'accueil"}
          submitTone="outline"
          className="mt-3"
          confirm={page.home ? undefined : "Cette page remplacera l'accueil actuel du site. Continuer ?"}
        >
          <input type="hidden" name="slug" value={page.slug} />
          <input type="hidden" name="home" value={page.home ? "false" : "true"} />
          <p className="text-sm text-muted">
            {page.home
              ? "Cette page est servie à la racine du site ; son adresse /pages/… y redirige."
              : "Servir cette page à la racine du site. Une seule page à la fois : celle qui l'est aujourd'hui sera libérée."}
          </p>
        </ActionForm>
      )}

      {/*
        Les deux pages dont le texte est rédigé dans le code : on peut les reposer
        d'un bouton. Sans cela, les mettre en ligne demanderait la ligne de commande.
      */}
      {page && editorial && (
        <Card title={`Contenu rédigé de « ${editorial.title} »`} className="mt-6">
          <ActionForm
            action={restoreEditorialPageAction}
            submitLabel="Reprendre le contenu rédigé"
            submitTone="outline"
            confirm={`Remplacer tout le contenu de « ${page.title} » par le texte rédigé ? Les blocs actuels seront perdus.`}
            footerNote={
              missingPhotos.length === 0
                ? "Toutes les photos sont déjà dans la médiathèque."
                : `${missingPhotos.length} photo${missingPhotos.length > 1 ? "s" : ""} seront ajoutées à la médiathèque au passage.`
            }
          >
            <input type="hidden" name="slug" value={page.slug} />
            <p className="text-sm leading-relaxed text-muted">
              Repose cette page sur le texte et la mise en page d'origine, <strong className="text-ink">photos comprises</strong> :
              celles qui manquent sont envoyées dans la{" "}
              <Link href="/admin/medias" className="font-bold underline">médiathèque</Link> automatiquement. Rien à préparer.
              À utiliser pour poser la page la première fois, ou pour revenir au texte d'origine après des essais.
              <strong className="text-ink"> Ce que vous avez modifié ici sera remplacé.</strong>
            </p>
          </ActionForm>
        </Card>
      )}

      {page && (
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-subtle">Contenu</h2>
          {imported && (
            <Notice tone="info">
              Cette page était rédigée avec l'ancien éditeur de texte. Son contenu a été repris en blocs — vérifiez le
              découpage, puis enregistrez le contenu pour le figer.
            </Notice>
          )}
          <BlockEditor slug={page.slug} title={page.title} path={page.home ? "/" : pagePath(page.slug)} initialData={toBlockData(initial)} media={media} metadata={metadata} save={savePageBlocksAction} />
        </div>
      )}

      {/* Repliée par défaut : une page ordinaire n'a pas besoin qu'on y touche. */}
      {page && (
        <Card
          title="Référencement et partage"
          collapsible
          className="mt-6"
          aside={<span className="text-xs font-semibold text-subtle">{seoSummary(page)}</span>}
        >
          <ActionForm action={savePageSeoAction} submitLabel="Enregistrer le référencement">
            <input type="hidden" name="slug" value={page.slug} />
            <SeoFields seo={page.seo} pageTitle={page.title} url={`${siteUrl()}${page.home ? "/" : pagePath(page.slug)}`} media={media} />
          </ActionForm>
        </Card>
      )}

      {page && (
        <Card title="Zone dangereuse" className="mt-8 border border-danger-bg">
          <ActionForm action={deletePageAction} submitLabel="Supprimer la page" submitTone="danger" confirm={`Supprimer « ${page.title} » ?`}>
            <input type="hidden" name="slug" value={page.slug} />
            <p className="text-sm text-muted">Les menus qui pointent vers cette page afficheront un lien mort : pensez à les mettre à jour.</p>
          </ActionForm>
        </Card>
      )}
    </>
  );
}

/** Ce que la carte repliée doit dire d'elle-même, sans qu'on l'ouvre. */
function seoSummary(page: Page): string {
  const parts: string[] = [];
  if (page.seo.title || page.seo.description) parts.push("titre et description personnalisés");
  if (page.seo.image) parts.push("image de partage");
  if (page.seo.noindex) parts.push("non indexée");
  if (page.seo.canonical) parts.push("canonique définie");
  return parts.length ? parts.join(" · ") : "réglages par défaut";
}
