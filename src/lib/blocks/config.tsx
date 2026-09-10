import Image from "next/image";
import type { CSSProperties } from "react";
import type { Config, RichText, Slot } from "@puckeditor/core";
import { MediaPickerField } from "@/components/admin/MediaPickerField";
import { CollectionOfferButton } from "@/components/site/CollectionOfferButton";
import { ContactForm } from "@/components/site/ContactForm";
import { CtaBand, HomeHero, Split, Tiles } from "@/components/site/home-sections";
import { SortSelect } from "@/components/site/SortSelect";
import Link from "next/link";
import { Newsletter } from "@/components/site/Newsletter";
import { ProductCard } from "@/components/site/ProductCard";
import { Chip, Eyebrow, PillLink, TINT_BG, TINT_INK } from "@/components/site/ui";
import type { BlockDocument, ImageRef, Product, Tint } from "@/lib/domain/types";
import { systemPath } from "@/lib/domain/system-pages";
import type { Data } from "@puckeditor/core";

/*
 * Catalogue des blocs de l'éditeur visuel (Puck). Un bloc = un composant React de la
 * charte, plus la description de ses champs : Puck en déduit le panneau d'édition, et
 * le même composant sert à l'édition et au rendu public. Rien de neuf côté style — les
 * blocs passent par les jetons Tailwind (TINT_BG / TINT_INK) comme le reste du site.
 *
 * Convention : chaque bloc est une <section> autonome qui porte son propre
 * `site-wrap`. Une page de blocs n'a donc pas de conteneur imposé, et un bloc pleine
 * largeur (héro, bandeau, galerie) cohabite avec un bloc de texte sans bricolage.
 *
 * Ce fichier est importé des deux côtés (éditeur client, rendu serveur) : pas de
 * "use client", pas d'accès aux données, aucun import `server-only`.
 */

/*
 * Données ambiantes de la page, fournies par l'hôte (métadonnées Puck) et non par
 * l'auteur : le catalogue publié n'est pas un contenu qu'on rédige dans un bloc. Le
 * rendu public comme l'éditeur les passent, si bien que l'aperçu reste fidèle.
 */
export type BlockMetadata = {
  /** Catalogue publié, pour les blocs qui montrent des livres. */
  products?: Product[];
  /** Tri courant du catalogue, lu dans la query par la route. */
  sort?: string;
  /** L'offre « collection complète » est-elle active dans les réglages. */
  collectionOffer?: boolean;
  /** Coordonnées de la boutique, tenues dans les réglages et non ressaisies. */
  contact?: { email?: string; socials: { label: string; href: string }[] };
  /** Réglages du formulaire de contact et questions fréquentes (Contenus, FAQ). */
  contactForm?: { subjects: string[]; legal: string; successText: string };
  faq?: { q: string; a: string }[];
};

const TINT_OPTIONS = [
  { label: "Vert", value: "green" },
  { label: "Bleu", value: "blue" },
  { label: "Rose", value: "pink" },
  { label: "Sable", value: "sand" },
];

const ALIGN_OPTIONS = [
  { label: "Gauche", value: "left" },
  { label: "Centré", value: "center" },
];

/** Champ image : ouvre la médiathèque plutôt que de réclamer une URL au clavier. */
const imageField = (label: string) =>
  ({
    type: "custom" as const,
    label,
    render: ({ value, onChange, readOnly }: { value: ImageRef | undefined; onChange: (v: ImageRef | undefined) => void; readOnly?: boolean }) => (
      <MediaPickerField value={value} onChange={onChange} readOnly={readOnly} />
    ),
  });

/*
 * Contenu d'une colonne : flux normal (voir la racine), et le `site-wrap` des blocs
 * déposés est neutralisé — la colonne porte déjà la largeur et la gouttière, un
 * second `site-wrap` imbriqué ajouterait un retrait et un plafond de largeur.
 */
const SLOT = "[&>.site-wrap]:max-w-none [&>.site-wrap]:px-0";

/** Les tris proposés au catalogue, et leur application. Le tri courant vient de l'URL. */
export const CATALOGUE_SORTS = [
  { value: "position", label: "En vedette" },
  { value: "title-asc", label: "Alphabétique, A à Z" },
  { value: "title-desc", label: "Alphabétique, Z à A" },
  { value: "price-asc", label: "Prix croissant" },
  { value: "price-desc", label: "Prix décroissant" },
];

function sortProducts(products: Product[], sort: string): Product[] {
  const copy = [...products];
  switch (sort) {
    case "title-asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "fr"));
    case "title-desc":
      return copy.sort((a, b) => b.title.localeCompare(a.title, "fr"));
    case "price-asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price-desc":
      return copy.sort((a, b) => b.price - a.price);
    default:
      return copy;
  }
}

/** Le champ « texte riche » de Puck rend soit du HTML, soit déjà des nœuds React. */
function Rich({ value, className = "" }: { value: RichText; className?: string }) {
  if (typeof value === "string") return <div className={className} dangerouslySetInnerHTML={{ __html: value }} />;
  return <div className={className}>{value}</div>;
}

type Props = {
  HerosAccueil: { badge: string; titre: string; texte: string; video: ImageRef | undefined; affiche: ImageRef | undefined; ctaLabel: string; ctaHref: string; cta2Label: string; cta2Href: string };
  Catalogue: { titre: string; lienLabel: string; nombre: number };
  HerosCatalogue: { surtitre: string; titre: string; texte: string; teinte: Tint; offreActive: boolean; offreTitre: string; offrePrixBarre: string; offrePrix: string; offreNote: string; offreCtaLabel: string };
  GrilleCatalogue: Record<string, never>;
  Specs: { items: { titre: string; texte: string }[] };
  HerosContact: { surtitre: string; titre: string; texte: string; teinte: Tint; proLabel: string; proTexte: string };
  FormulaireContact: Record<string, never>;
  FAQ: { titre: string; note: string };
  Heros: { surtitre: string; titre: string; texte: string; image: ImageRef | undefined; teinte: Tint };
  Titre: { texte: string; niveau: "2" | "3"; surtitre: string; alignement: "left" | "center" };
  Texte: { contenu: RichText };
  Prose: { titre: string; paragraphes: { texte: string }[] };
  Encadre: { teinte: Tint; contenu: RichText };
  Bouton: { label: string; href: string; style: "dark" | "light" | "paper"; alignement: "left" | "center" };
  Illustration: { image: ImageRef | undefined; legende: string; pleineLargeur: boolean };
  Galerie: { images: { image: ImageRef | undefined }[]; hauteur: number };
  Colonnes: { repartition: "2" | "3" | "1-2" | "2-1"; espacement: "sm" | "md" | "lg"; gauche: Slot; centre: Slot; droite: Slot };
  Principes: { items: { surtitre: string; titre: string; texte: string; teinte: Tint }[] };
  Tuiles: { items: { titre: string; texte: string; teinte: Tint }[] };
  ImageTexte: { surtitre: string; titre: string; texte: string; image: ImageRef | undefined; cote: "left" | "right"; teinte: "" | Tint; ctaLabel: string; ctaHref: string; ctaStyle: "pill" | "underline"; hauteurMedia: number };
  Bandeau: { titre: string; texte: string; ctaLabel: string; ctaHref: string };
  Infolettre: { titre: string; texte: string; placeholder: string; bouton: string };
  Espace: { hauteur: "sm" | "md" | "lg" };
};

export const blockConfig: Config<Props> = {
  root: {
    fields: {},
    /*
     * Flux normal, surtout pas `flex flex-col` : les marges horizontales `auto` de
     * `site-wrap` l'emportent alors sur `align-self: stretch`, chaque bloc se
     * dimensionne à son contenu et les largeurs cessent d'être alignées entre blocs.
     */
    render: ({ children }) => <div>{children}</div>,
  },
  categories: {
    entete: { title: "En-tête", components: ["HerosAccueil", "Heros", "Titre"] },
    texte: { title: "Texte", components: ["Texte", "Prose", "Encadre", "Bouton"] },
    media: { title: "Médias", components: ["Illustration", "Galerie", "ImageTexte"] },
    mise_en_page: { title: "Mise en page", components: ["Colonnes", "Principes", "Tuiles", "Bandeau", "Infolettre", "Espace"] },
    donnees: { title: "Données du site", components: ["Catalogue", "HerosCatalogue", "GrilleCatalogue", "Specs", "HerosContact", "FormulaireContact", "FAQ"] },
  },
  components: {
    /** Héro pleine largeur de l'accueil : vidéo ou affiche, texte calé en bas. */
    HerosAccueil: {
      label: "Héro d'accueil",
      fields: {
        badge: { type: "text", label: "Badge" },
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        video: imageField("Vidéo de fond"),
        affiche: imageField("Image de repli"),
        ctaLabel: { type: "text", label: "Bouton principal — libellé" },
        ctaHref: { type: "text", label: "Bouton principal — lien" },
        cta2Label: { type: "text", label: "Bouton secondaire — libellé" },
        cta2Href: { type: "text", label: "Bouton secondaire — lien" },
      },
      defaultProps: { badge: "", titre: "Un titre", texte: "", video: undefined, affiche: undefined, ctaLabel: "", ctaHref: "", cta2Label: "", cta2Href: "" },
      render: ({ badge, titre, texte, video, affiche, ctaLabel, ctaHref, cta2Label, cta2Href }) => (
        <HomeHero
          hero={{
            badge,
            heading: titre,
            text: texte,
            videoUrl: video?.url ?? "",
            posterUrl: affiche?.url ?? "",
            primary: { label: ctaLabel, href: ctaHref },
            secondary: { label: cta2Label, href: cta2Href },
          }}
        />
      ),
    },

    /*
     * Grille du catalogue publié. Le seul bloc qui affiche des données du site plutôt
     * que du contenu rédigé : les livres arrivent par `puck.metadata`, l'auteur ne
     * règle que le titre, le lien et le nombre de titres montrés.
     */
    Catalogue: {
      label: "Grille du catalogue",
      fields: {
        titre: { type: "text", label: "Titre" },
        lienLabel: { type: "text", label: "Lien — libellé", },
        nombre: { type: "number", label: "Nombre de titres", min: 1, max: 12 },
      },
      defaultProps: { titre: "Mon vrai imagier", lienLabel: "Voir le catalogue →", nombre: 4 },
      render: ({ titre, lienLabel, nombre, puck }) => {
        const products = ((puck.metadata as BlockMetadata).products ?? []).slice(0, nombre);
        return (
          <section className="site-wrap flex flex-col gap-8 py-[4.5rem]">
            <div className="flex flex-wrap items-baseline justify-between gap-6">
              <h2 className="display-2">{titre}</h2>
              {lienLabel && (
                <Link href={systemPath("catalogue")} className="rounded-pill bg-white px-[1.125rem] py-2.5 text-[0.8125rem] font-bold">
                  {lienLabel}
                </Link>
              )}
            </div>
            {products.length === 0 ? (
              <p className="rounded-card bg-white p-6 text-sm text-muted">Aucun titre publié pour l'instant.</p>
            ) : (
              <div className="grid grid-cols-4 gap-5 max-[989px]:grid-cols-2 max-[479px]:grid-cols-1">
                {products.map((p) => (
                  /* Dans l'éditeur, la carte est figée : pas de contexte de panier hors du site. */
                  <ProductCard key={p.slug} product={p} variant="compact" preview={puck.isEditing} />
                ))}
              </div>
            )}
          </section>
        );
      },
    },

    /*
     * Héro du catalogue : panneau teinté, et l'encart « collection complète » quand
     * l'offre est active dans les réglages. « [count] » est remplacé par le nombre de
     * titres publiés — c'est une donnée du site, pas un texte à tenir à jour.
     */
    HerosCatalogue: {
      label: "Héro du catalogue",
      fields: {
        surtitre: { type: "text", label: "Surtitre", },
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        teinte: { type: "select", label: "Teinte", options: TINT_OPTIONS },
        offreActive: { type: "radio", label: "Encart collection", options: [{ label: "Afficher", value: true }, { label: "Masquer", value: false }] },
        offreTitre: { type: "text", label: "Offre — titre" },
        offrePrixBarre: { type: "text", label: "Offre — prix barré" },
        offrePrix: { type: "text", label: "Offre — prix" },
        offreNote: { type: "textarea", label: "Offre — note" },
        offreCtaLabel: { type: "text", label: "Offre — bouton" },
      },
      defaultProps: { surtitre: "Collection 6-18 mois · [count] titres", titre: "Mon vrai imagier", texte: "", teinte: "green", offreActive: false, offreTitre: "", offrePrixBarre: "", offrePrix: "", offreNote: "", offreCtaLabel: "" },
      render: ({ surtitre, titre, texte, teinte, offreActive, offreTitre, offrePrixBarre, offrePrix, offreNote, offreCtaLabel, puck }) => {
        const meta = puck.metadata as BlockMetadata;
        const count = meta.products?.length ?? 0;
        // L'encart n'a de sens que si l'offre est vraiment active côté réglages.
        const showOffer = offreActive && (meta.collectionOffer ?? false) && count > 1;
        return (
          <section className="site-wrap pt-2">
            <div className={`grid grid-cols-[1.2fr_1fr] items-end gap-10 rounded-panel px-16 py-14 max-[899px]:grid-cols-1 max-[899px]:items-stretch max-[899px]:px-7 max-[899px]:py-9 ${TINT_BG[teinte]}`}>
              <div className="flex flex-col gap-4">
                {surtitre && <Eyebrow className={TINT_INK[teinte]}>{surtitre.replace("[count]", String(count))}</Eyebrow>}
                <h1 className="display-1 text-[clamp(2rem,4.4vw,3.25rem)]">{titre}</h1>
                {texte && <p className={`max-w-[520px] text-[1.0625rem] leading-relaxed ${TINT_INK[teinte]}`}>{texte}</p>}
              </div>
              {showOffer && (
                <div className="flex flex-col gap-3 rounded-card bg-white p-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[0.9375rem] font-bold">{offreTitre}</span>
                    {offrePrixBarre && <s className="text-[0.8125rem] font-semibold text-subtle">{offrePrixBarre}</s>}
                  </div>
                  <span className="text-[2rem] font-extrabold tracking-[-0.02em]">{offrePrix}</span>
                  {offreNote && <span className="text-[0.8125rem] leading-relaxed text-muted">{offreNote}</span>}
                  {/* Bouton marchand : figé dans l'éditeur, faute de contexte de panier. */}
                  {offreCtaLabel &&
                    (puck.isEditing ? (
                      <span className="w-fit rounded-pill bg-ink px-4 py-2.5 text-xs font-bold text-white">{offreCtaLabel}</span>
                    ) : (
                      <CollectionOfferButton label={offreCtaLabel} />
                    ))}
                </div>
              )}
            </div>
          </section>
        );
      },
    },

    /*
     * Le catalogue complet : barre de tri et grille. Les livres et le tri courant
     * viennent des métadonnées — le tri est un paramètre d'URL, que seule la route
     * peut lire.
     */
    GrilleCatalogue: {
      label: "Catalogue complet",
      fields: {},
      defaultProps: {},
      render: ({ puck }) => {
        const meta = puck.metadata as BlockMetadata;
        const products = meta.products ?? [];
        const sorted = sortProducts(products, meta.sort ?? "position");
        return (
          <>
            <section className="site-wrap flex flex-wrap items-center justify-between gap-4 pt-8 max-[749px]:items-start">
              <div className="flex flex-wrap gap-2">
                <Chip active>Tous</Chip>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[0.8125rem] font-semibold">
                <span className="text-subtle">
                  {products.length} {products.length > 1 ? "articles" : "article"}
                </span>
                <SortSelect value={meta.sort ?? "position"} options={CATALOGUE_SORTS} />
              </div>
            </section>
            <section className="site-wrap pt-6 pb-[4.5rem]">
              {sorted.length > 0 ? (
                <div className="grid grid-cols-3 gap-5 max-[989px]:grid-cols-2 max-[599px]:grid-cols-1">
                  {sorted.map((p) => (
                    <ProductCard key={p.slug} product={p} preview={puck.isEditing} />
                  ))}
                </div>
              ) : (
                <p className="text-[0.9375rem] text-muted">Aucun livre publié pour le moment.</p>
              )}
            </section>
          </>
        );
      },
    },

    /** Bande de caractéristiques, en colonnes séparées par un filet. */
    Specs: {
      label: "Caractéristiques",
      fields: {
        items: {
          type: "array",
          label: "Colonnes",
          arrayFields: { titre: { type: "text", label: "Titre" }, texte: { type: "textarea", label: "Texte" } },
          getItemSummary: (item) => item.titre || "Colonne",
        },
      },
      defaultProps: { items: [] },
      render: ({ items }) =>
        items.length === 0 ? (
          <></>
        ) : (
          <section className="site-wrap">
            <div className="grid grid-cols-3 overflow-hidden rounded-panel bg-white max-[899px]:grid-cols-1">
              {items.map((sp, i) => (
                <div key={i} className={`flex flex-col gap-2.5 p-10 ${i < items.length - 1 ? "border-r border-line max-[899px]:border-r-0 max-[899px]:border-b" : ""}`}>
                  <span className="text-xl font-extrabold">{sp.titre}</span>
                  <span className="text-sm leading-relaxed text-muted">{sp.texte}</span>
                </div>
              ))}
            </div>
          </section>
        ),
    },

    /*
     * Héro de la page contact : panneau teinté et carte de coordonnées. L'e-mail et
     * les réseaux viennent des réglages — jamais ressaisis ici, sinon ils divergent.
     */
    HerosContact: {
      label: "Héro de contact",
      fields: {
        surtitre: { type: "text", label: "Surtitre" },
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        teinte: { type: "select", label: "Teinte", options: TINT_OPTIONS },
        proLabel: { type: "text", label: "Encart pro — intitulé" },
        proTexte: { type: "textarea", label: "Encart pro — texte" },
      },
      defaultProps: { surtitre: "Contact", titre: "Écrivez-nous", texte: "", teinte: "green", proLabel: "Professionnels & revendeurs", proTexte: "" },
      render: ({ surtitre, titre, texte, teinte, proLabel, proTexte, puck }) => {
        const contact = (puck.metadata as BlockMetadata).contact;
        return (
          <div className="flex flex-col gap-4">
            <div className={`flex flex-col gap-[1.125rem] rounded-panel p-12 max-[899px]:p-8 ${TINT_BG[teinte]}`}>
              {surtitre && <Eyebrow className={TINT_INK[teinte]}>{surtitre}</Eyebrow>}
              <h1 className="display-1 text-[clamp(1.875rem,4vw,2.875rem)]">{titre}</h1>
              {texte && <p className={`leading-relaxed ${TINT_INK[teinte]}`}>{texte}</p>}
            </div>
            <div className="flex flex-col gap-5 rounded-card bg-white p-8">
              {contact?.email && (
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">E-mail</span>
                  <a href={`mailto:${contact.email}`} className="w-fit font-bold">
                    {contact.email}
                  </a>
                </div>
              )}
              {contact && contact.socials.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Réseaux</span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {contact.socials.map((sn) => (
                      <a key={sn.label} href={sn.href} target="_blank" rel="me noopener" className="rounded-pill bg-paper px-3.5 py-2 text-[0.8125rem] font-semibold">
                        {sn.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {proTexte && (
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">{proLabel}</span>
                  <span className="text-sm leading-relaxed text-[#555]">{proTexte}</span>
                </div>
              )}
            </div>
          </div>
        );
      },
    },

    /** Formulaire de contact. Sujets, mention légale et message de succès : Contenus. */
    FormulaireContact: {
      label: "Formulaire de contact",
      fields: {},
      defaultProps: {},
      render: ({ puck }) => {
        const cfg = (puck.metadata as BlockMetadata).contactForm;
        return (
          <div className="rounded-panel bg-white p-12 max-[899px]:p-8">
            <ContactForm subjects={cfg?.subjects ?? []} legal={cfg?.legal ?? ""} successText={cfg?.successText ?? ""} />
          </div>
        );
      },
    },

    /** Questions fréquentes. Les questions se gèrent dans /admin/faq. */
    FAQ: {
      label: "Questions fréquentes",
      fields: {
        titre: { type: "text", label: "Titre" },
        note: { type: "text", label: "Mention à droite" },
      },
      defaultProps: { titre: "Questions fréquentes", note: "" },
      render: ({ titre, note, puck }) => {
        const items = (puck.metadata as BlockMetadata).faq ?? [];
        if (items.length === 0) return <></>;
        return (
          <section id="faq" className="site-wrap flex flex-col gap-7 pt-[4.5rem]">
            <div className="flex flex-wrap items-baseline justify-between gap-6">
              <h2 className="display-2">{titre}</h2>
              {note && <span className="text-[0.8125rem] font-semibold text-subtle">{note}</span>}
            </div>
            <div className="grid grid-cols-2 gap-4 max-[899px]:grid-cols-1">
              {items.map((f, i) => (
                <div key={i} className="flex flex-col gap-2.5 rounded-card bg-white p-7">
                  <span className="font-bold leading-snug">{f.q}</span>
                  <span className="text-sm leading-relaxed text-[#555]">{f.a}</span>
                </div>
              ))}
            </div>
          </section>
        );
      },
    },

    /** Héro bicolore de « Notre histoire » : panneau teinté à gauche, image à droite. */
    Heros: {
      label: "Héro bicolore",
      fields: {
        surtitre: { type: "text", label: "Surtitre" },
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        image: imageField("Image"),
        teinte: { type: "select", label: "Teinte du panneau", options: TINT_OPTIONS },
      },
      defaultProps: { surtitre: "Notre histoire", titre: "Un titre", texte: "", image: undefined, teinte: "pink" },
      render: ({ surtitre, titre, texte, image, teinte }) => (
        <section className="site-wrap pt-2">
          <div className="grid grid-cols-2 gap-4 max-[899px]:grid-cols-1">
            <div className={`flex flex-col justify-center gap-5 rounded-panel p-16 max-[899px]:p-8 ${TINT_BG[teinte]}`}>
              {surtitre && <Eyebrow className={TINT_INK[teinte]}>{surtitre}</Eyebrow>}
              <h1 className="display-1 text-[clamp(2rem,4.6vw,3.375rem)]">{titre}</h1>
              {texte && <p className={`text-[1.0625rem] leading-relaxed ${TINT_INK[teinte]}`}>{texte}</p>}
            </div>
            {image && (
              <Image
                src={image.url}
                alt={image.alt}
                width={image.width ?? 1200}
                height={image.height ?? 900}
                sizes="(min-width: 900px) 50vw, 100vw"
                className="h-[520px] w-full rounded-panel object-cover max-[899px]:h-72"
              />
            )}
          </div>
        </section>
      ),
    },

    Titre: {
      label: "Titre",
      fields: {
        surtitre: { type: "text", label: "Surtitre" },
        texte: { type: "text", label: "Titre" },
        niveau: { type: "radio", label: "Niveau", options: [{ label: "H2", value: "2" }, { label: "H3", value: "3" }] },
        alignement: { type: "radio", label: "Alignement", options: ALIGN_OPTIONS },
      },
      defaultProps: { texte: "Un titre", niveau: "2", surtitre: "", alignement: "left" },
      render: ({ texte, niveau, surtitre, alignement }) => {
        const Tag = niveau === "3" ? "h3" : "h2";
        return (
          <section className="site-wrap pt-10">
            <div className={`flex flex-col gap-2 ${alignement === "center" ? "items-center text-center" : ""}`}>
              {surtitre && <Eyebrow className="text-muted">{surtitre}</Eyebrow>}
              <Tag className={niveau === "3" ? "text-xl font-extrabold tracking-[-0.01em]" : "display-2"}>{texte}</Tag>
            </div>
          </section>
        );
      },
    },

    Texte: {
      label: "Texte",
      fields: { contenu: { type: "richtext", label: "Contenu" } },
      defaultProps: { contenu: "<p>Rédigez ici…</p>" },
      render: ({ contenu }) => (
        <section className="site-wrap py-6">
          <Rich value={contenu} className="prose-mv" />
        </section>
      ),
    },

    /** Prose de « Notre histoire » : titre à gauche, texte au fil à droite, chute en gras. */
    Prose: {
      label: "Prose (titre / texte)",
      fields: {
        titre: { type: "text", label: "Titre" },
        paragraphes: {
          type: "array",
          label: "Paragraphes",
          arrayFields: { texte: { type: "textarea", label: "Paragraphe" } },
          getItemSummary: (item, i) => item.texte?.slice(0, 40) || `Paragraphe ${(i ?? 0) + 1}`,
        },
      },
      defaultProps: { titre: "Un titre", paragraphes: [{ texte: "" }] },
      render: ({ titre, paragraphes }) => (
        <section className="site-wrap grid grid-cols-[1fr_1.4fr] gap-16 py-20 max-[899px]:grid-cols-1 max-[899px]:gap-6 max-[899px]:py-12">
          <h2 className="display-2">{titre}</h2>
          <div className="flex flex-col gap-5 text-[1.0625rem] leading-[1.65] text-[#444]">
            {paragraphes.map((p, i) => (
              <p key={i} className={i === paragraphes.length - 1 && paragraphes.length > 1 ? "font-semibold text-ink" : ""}>
                {p.texte}
              </p>
            ))}
          </div>
        </section>
      ),
    },

    Encadre: {
      label: "Encadré",
      fields: {
        teinte: { type: "select", label: "Teinte", options: TINT_OPTIONS },
        contenu: { type: "richtext", label: "Contenu" },
      },
      defaultProps: { teinte: "sand", contenu: "<p>Une information à mettre en avant.</p>" },
      render: ({ teinte, contenu }) => (
        <section className="site-wrap py-4">
          <Rich value={contenu} className={`prose-mv max-w-none rounded-card p-7 ${TINT_BG[teinte]} ${TINT_INK[teinte]}`} />
        </section>
      ),
    },

    Bouton: {
      label: "Bouton",
      fields: {
        label: { type: "text", label: "Libellé" },
        href: { type: "text", label: "Lien" },
        style: { type: "radio", label: "Style", options: [{ label: "Noir", value: "dark" }, { label: "Blanc", value: "light" }, { label: "Crème", value: "paper" }] },
        alignement: { type: "radio", label: "Alignement", options: ALIGN_OPTIONS },
      },
      defaultProps: { label: "Découvrir", href: "/catalogue", style: "dark", alignement: "left" },
      render: ({ label, href, style, alignement }) => (
        <section className="site-wrap py-4">
          <div className={`flex ${alignement === "center" ? "justify-center" : ""}`}>
            <PillLink href={href || "#"} variant={style}>
              {label}
            </PillLink>
          </div>
        </section>
      ),
    },

    Illustration: {
      label: "Image",
      fields: {
        image: imageField("Image"),
        legende: { type: "text", label: "Légende" },
        pleineLargeur: { type: "radio", label: "Largeur", options: [{ label: "Colonne de texte", value: false }, { label: "Pleine largeur", value: true }] },
      },
      defaultProps: { image: undefined, legende: "", pleineLargeur: false },
      render: ({ image, legende, pleineLargeur }) => (
        <section className="site-wrap py-6">
          {image ? (
            <figure className={`flex flex-col gap-2 ${pleineLargeur ? "" : "max-w-[42rem]"}`}>
              <Image src={image.url} alt={image.alt} width={image.width ?? 1200} height={image.height ?? 800} sizes="(min-width: 900px) 56rem, 100vw" className="h-auto w-full rounded-card object-cover" />
              {legende && <figcaption className="text-[0.8125rem] text-muted">{legende}</figcaption>}
            </figure>
          ) : (
            <div className="rounded-card bg-paper px-6 py-12 text-center text-sm text-muted">Choisissez une image.</div>
          )}
        </section>
      ),
    },

    /** Triptyque photo de « Notre histoire » : autant de colonnes que d'images. */
    Galerie: {
      label: "Galerie",
      fields: {
        images: {
          type: "array",
          label: "Images",
          arrayFields: { image: imageField("Image") },
          getItemSummary: (item, i) => item.image?.alt || `Image ${(i ?? 0) + 1}`,
        },
        hauteur: { type: "number", label: "Hauteur (px)", min: 120, max: 720 },
      },
      defaultProps: { images: [], hauteur: 380 },
      render: ({ images, hauteur }) => {
        const shown = images.filter((i) => i.image);
        if (shown.length === 0) return <section className="site-wrap py-6"><div className="rounded-card bg-paper px-6 py-12 text-center text-sm text-muted">Ajoutez des images.</div></section>;
        return (
          <section className="site-wrap mt-16 grid gap-4 max-[899px]:mt-8 max-[899px]:grid-cols-2" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
            {shown.map((it, i) => (
              <Image
                key={i}
                src={it.image!.url}
                alt={it.image!.alt}
                width={it.image!.width ?? 900}
                height={it.image!.height ?? 900}
                sizes="(min-width: 750px) 33vw, 100vw"
                /* Hauteur par variable CSS et non en style en ligne : sinon elle
                   écraserait le repli mobile `max-[899px]:h-48`. */
                className="h-[var(--galerie-h)] w-full rounded-card object-cover max-[899px]:h-48"
                style={{ "--galerie-h": `${hauteur}px` } as CSSProperties}
              />
            ))}
          </section>
        );
      },
    },

    /*
     * Le bloc qui fait la « mise en page avancée » : chaque colonne est un slot, donc
     * une zone où l'on dépose d'autres blocs (y compris d'autres colonnes).
     */
    Colonnes: {
      label: "Colonnes",
      fields: {
        repartition: {
          type: "select",
          label: "Répartition",
          options: [
            { label: "2 égales", value: "2" },
            { label: "3 égales", value: "3" },
            { label: "1 / 2", value: "1-2" },
            { label: "2 / 1", value: "2-1" },
          ],
        },
        espacement: { type: "radio", label: "Espacement", options: [{ label: "S", value: "sm" }, { label: "M", value: "md" }, { label: "L", value: "lg" }] },
        gauche: { type: "slot", label: "Colonne 1" },
        centre: { type: "slot", label: "Colonne 2" },
        droite: { type: "slot", label: "Colonne 3" },
      },
      defaultProps: { repartition: "2", espacement: "md", gauche: [], centre: [], droite: [] },
      render: ({ repartition, espacement, gauche: Gauche, centre: Centre, droite: Droite }) => {
        const cols = { "2": "grid-cols-2", "3": "grid-cols-3", "1-2": "grid-cols-[1fr_2fr]", "2-1": "grid-cols-[2fr_1fr]" }[repartition];
        const gap = { sm: "gap-3", md: "gap-6", lg: "gap-10" }[espacement];
        return (
          <section className="site-wrap py-6">
            <div className={`grid items-start ${cols} ${gap} max-[749px]:!grid-cols-1`}>
              <Gauche className={SLOT} />
              {repartition === "3" ? <Centre className={SLOT} /> : null}
              <Droite className={SLOT} />
            </div>
          </section>
        );
      },
    },

    /** Les trois principes teintés de « Notre histoire ». */
    Principes: {
      label: "Principes",
      fields: {
        items: {
          type: "array",
          label: "Principes",
          arrayFields: {
            surtitre: { type: "text", label: "Surtitre" },
            titre: { type: "text", label: "Titre" },
            texte: { type: "textarea", label: "Texte" },
            teinte: { type: "select", label: "Teinte", options: TINT_OPTIONS },
          },
          getItemSummary: (item) => item.titre || "Principe",
        },
      },
      defaultProps: { items: [] },
      render: ({ items }) => (
        <section className="site-wrap grid grid-cols-3 gap-4 max-[899px]:grid-cols-1">
          {items.map((p, i) => (
            <div key={i} className={`flex flex-col gap-3 rounded-card p-8 ${TINT_BG[p.teinte]}`}>
              <span className={`text-[0.8125rem] font-bold uppercase tracking-[0.1em] ${TINT_INK[p.teinte]}`}>{p.surtitre}</span>
              <span className="text-lg font-bold leading-snug">{p.titre}</span>
              <span className={`text-sm leading-relaxed ${TINT_INK[p.teinte]}`}>{p.texte}</span>
            </div>
          ))}
        </section>
      ),
    },

    Tuiles: {
      label: "Tuiles",
      fields: {
        items: {
          type: "array",
          label: "Tuiles",
          arrayFields: {
            titre: { type: "text", label: "Titre" },
            texte: { type: "textarea", label: "Texte" },
            teinte: { type: "select", label: "Teinte", options: TINT_OPTIONS },
          },
          getItemSummary: (item) => item.titre || "Tuile",
        },
      },
      defaultProps: { items: [] },
      /* Le composant de la charte, celui de l'accueil : une seule allure de tuile. */
      render: ({ items }) => <Tiles tiles={items.map((t) => ({ title: t.titre, text: t.texte, tint: t.teinte }))} />,
    },

    /** Réutilise le bloc « image + texte » de la page d'accueil, à l'identique. */
    ImageTexte: {
      label: "Image + texte",
      fields: {
        surtitre: { type: "text", label: "Surtitre" },
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        image: imageField("Image"),
        cote: { type: "radio", label: "Image à", options: [{ label: "Gauche", value: "left" }, { label: "Droite", value: "right" }] },
        teinte: { type: "select", label: "Fond", options: [{ label: "Aucun (blanc)", value: "" }, ...TINT_OPTIONS] },
        ctaLabel: { type: "text", label: "Bouton — libellé" },
        ctaHref: { type: "text", label: "Bouton — lien" },
        ctaStyle: { type: "radio", label: "Bouton — style", options: [{ label: "Pilule", value: "pill" }, { label: "Souligné", value: "underline" }] },
        hauteurMedia: { type: "number", label: "Hauteur de l'image (px)", min: 200, max: 720 },
      },
      defaultProps: { surtitre: "", titre: "Un titre", texte: "", image: undefined, cote: "left", teinte: "", ctaLabel: "", ctaHref: "", ctaStyle: "pill", hauteurMedia: 380 },
      render: ({ surtitre, titre, texte, image, cote, teinte, ctaLabel, ctaHref, ctaStyle, hauteurMedia }) => (
        <Split
          eyebrow={surtitre}
          heading={titre}
          text={texte}
          image={image}
          cta={{ label: ctaLabel, href: ctaHref }}
          mediaSide={cote}
          tint={teinte || undefined}
          ctaStyle={ctaStyle}
          mediaHeight={hauteurMedia}
        />
      ),
    },

    Bandeau: {
      label: "Bandeau noir",
      fields: {
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        ctaLabel: { type: "text", label: "Bouton — libellé" },
        ctaHref: { type: "text", label: "Bouton — lien" },
      },
      defaultProps: { titre: "Prêt à commencer ?", texte: "", ctaLabel: "Voir le catalogue", ctaHref: "/catalogue" },
      render: ({ titre, texte, ctaLabel, ctaHref }) => <CtaBand heading={titre} text={texte} button={{ label: ctaLabel, href: ctaHref }} />,
    },

    Infolettre: {
      label: "Infolettre",
      fields: {
        titre: { type: "text", label: "Titre" },
        texte: { type: "textarea", label: "Texte" },
        placeholder: { type: "text", label: "Champ e-mail" },
        bouton: { type: "text", label: "Bouton" },
      },
      defaultProps: { titre: "Restez curieux", texte: "", placeholder: "Votre e-mail", bouton: "S'inscrire" },
      render: ({ titre, texte, placeholder, bouton }) => <Newsletter heading={titre} text={texte} placeholder={placeholder} button={bouton} />,
    },

    Espace: {
      label: "Espace",
      fields: { hauteur: { type: "radio", label: "Hauteur", options: [{ label: "S", value: "sm" }, { label: "M", value: "md" }, { label: "L", value: "lg" }] } },
      defaultProps: { hauteur: "md" },
      render: ({ hauteur }) => <div aria-hidden="true" className={{ sm: "h-4", md: "h-10", lg: "h-20" }[hauteur]} />,
    },
  },
};

/** Le document typé par bloc, tel que Puck le manipule. */
export type BlockData = Data<Props>;

/*
 * Passage du document validé (zod, forme générique) au document typé de Puck. Le zod
 * garantit l'enveloppe ; les props d'un bloc, elles, ne sont connues que du catalogue
 * ci-dessus, et Puck les réconcilie avec `defaultProps` au rendu. D'où cette seule
 * conversion, à la frontière, plutôt que des `any` disséminés.
 */
export function toBlockData(doc: BlockDocument): BlockData {
  return doc as unknown as BlockData;
}
