"use client";

import { useState } from "react";
import { MediaPickerField } from "./MediaPickerField";
import { Field, Input, Switch, Textarea } from "./ui";
import { MediaLibraryProvider } from "@/lib/blocks/media-context";
import type { ImageRef, Media, PageSeo } from "@/lib/domain/types";

/*
 * Bloc SEO d'une page. Trois choses qu'un champ nu ne donne pas : les limites que
 * Google applique réellement (au-delà, il tronque), un aperçu du résultat, et le
 * repli explicite quand un champ est vide — l'auteur voit ce qui sera publié, pas
 * ce qu'il a tapé.
 *
 * L'image de partage passe par la médiathèque et voyage en JSON dans un champ caché :
 * un ImageRef ne se poste pas en champ de formulaire ordinaire.
 */

/** Longueurs au-delà desquelles Google tronque, en pixels convertis en caractères. */
const LIMITS = { title: 60, description: 155 };

function Counter({ value, limit }: { value: string; limit: number }) {
  const n = value.trim().length;
  const tone = n === 0 ? "text-faint" : n > limit ? "text-danger" : n > limit - 10 ? "text-tint-sand-ink" : "text-subtle";
  return (
    <span className={`text-[0.6875rem] font-bold tabular-nums ${tone}`}>
      {n}/{limit}
      {n > limit && " · tronqué par Google"}
    </span>
  );
}

export function SeoFields({ seo, pageTitle, url, media }: { seo: PageSeo; pageTitle: string; url: string; media: Media[] }) {
  const [title, setTitle] = useState(seo.title ?? "");
  const [description, setDescription] = useState(seo.description ?? "");
  const [shareTitle, setShareTitle] = useState(seo.shareTitle ?? "");
  const [shareDescription, setShareDescription] = useState(seo.shareDescription ?? "");
  const [image, setImage] = useState<ImageRef | undefined>(seo.image);
  const [noindex, setNoindex] = useState(seo.noindex);

  const shownTitle = title.trim() || pageTitle;
  const shownDescription = description.trim();

  return (
    <div className="flex flex-col gap-5">
      {/* Aperçu : ce que verra quelqu'un dans une page de résultats. */}
      <div className="flex flex-col gap-1 rounded-[14px] bg-paper px-4 py-3.5">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Aperçu dans Google</span>
        <span className="truncate text-xs text-subtle">{url}</span>
        <span className="truncate text-[1.0625rem] font-semibold text-[#1a0dab]">{truncate(shownTitle, LIMITS.title)}</span>
        <span className="text-[0.8125rem] leading-snug text-muted">
          {shownDescription ? truncate(shownDescription, LIMITS.description) : "Sans description, Google compose un extrait à partir du contenu de la page."}
        </span>
        {noindex && <span className="mt-1 w-fit rounded-pill bg-tint-sand px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-sand-ink">Non indexée</span>}
      </div>

      <div className="grid grid-cols-2 items-start gap-3 max-[899px]:grid-cols-1">
        <Field label="Titre" hint={`Vide : « ${pageTitle} ».`} name="seoTitle">
          <div className="flex flex-col gap-1">
            <Input name="seoTitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} />
            <Counter value={title || pageTitle} limit={LIMITS.title} />
          </div>
        </Field>
        <Field label="Description" hint="Ce que Google affiche sous le titre." name="seoDescription">
          <div className="flex flex-col gap-1">
            <Textarea name="seoDescription" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={3} className="!min-h-0" />
            <Counter value={description} limit={LIMITS.description} />
          </div>
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Partage sur les réseaux</span>
        <div className="grid grid-cols-[240px_1fr] items-start gap-4 max-[899px]:grid-cols-1">
          <Field label="Image" hint="1200 × 630 idéalement. Vide : aucune vignette.">
            <MediaLibraryProvider media={media}>
              <MediaPickerField value={image} onChange={setImage} />
            </MediaLibraryProvider>
          </Field>
          <div className="flex flex-col gap-3">
            <Field label="Titre de partage" hint="Vide : le titre SEO ci-dessus." name="shareTitle">
              <Input name="shareTitle" value={shareTitle} onChange={(e) => setShareTitle(e.target.value)} maxLength={90} placeholder={shownTitle} />
            </Field>
            <Field label="Description de partage" hint="Vide : la description SEO ci-dessus." name="shareDescription">
              <Textarea name="shareDescription" value={shareDescription} onChange={(e) => setShareDescription(e.target.value)} maxLength={300} rows={2} className="!min-h-0" placeholder={shownDescription} />
            </Field>
          </div>
        </div>
        <input type="hidden" name="seoImage" value={image ? JSON.stringify(image) : ""} />
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Indexation</span>
        <input type="hidden" name="noindex" value={noindex ? "true" : "false"} />
        <Switch
          checked={noindex}
          onChange={(e) => setNoindex(e.target.checked)}
          label="Demander aux moteurs de ne pas indexer cette page"
          hint="La page reste accessible par son adresse ; elle sort seulement des résultats de recherche."
        />
        <Field label="Adresse canonique" hint={`Vide : ${url}. À renseigner seulement si cette page fait doublon avec une autre.`} name="canonical">
          <Input name="canonical" type="url" defaultValue={seo.canonical ?? ""} placeholder={url} />
        </Field>
      </div>
    </div>
  );
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
}
