import type { Metadata } from "next";
import Link from "next/link";
import { HomeHero, LastDayOffer, Split, Tiles } from "@/components/site/home-sections";
import { Newsletter } from "@/components/site/Newsletter";
import { ProductCard } from "@/components/site/ProductCard";
import { Render } from "@puckeditor/core/rsc";
import { blockConfig, toBlockData } from "@/lib/blocks/config";
import { buildBlockMetadata } from "@/lib/blocks/metadata";
import { getHomeContent } from "@/lib/db/content";
import { getHomePage } from "@/lib/db/pages";
import { getSettings } from "@/lib/db/settings";
import { collectionState, lastDayCountdown, toCollectionTitles } from "@/lib/promos/collection";
import { pageMetadata } from "@/lib/domain/page-metadata";
import { listPublishedProducts } from "@/lib/db/products";
import { systemPath } from "@/lib/domain/system-pages";

/*
 * Racine du site. Elle est servie par la page désignée comme accueil dans l'admin
 * (Pages → carte Publication), composée en blocs. À défaut, on retombe sur l'accueil
 * historique bâti depuis `content/home` (maquette 2a) — c'est ce que voit un site
 * tout neuf, avant qu'une page ne soit désignée.
 */
/** La racine hérite du bloc SEO de la page désignée comme accueil. */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getHomePage();
  return page ? pageMetadata(page) : {};
}

export default async function HomePage() {
  const [homePage, content, products, settings] = await Promise.all([
    getHomePage(),
    getHomeContent(),
    listPublishedProducts(),
    getSettings(),
  ]);

  if (homePage?.blocks) {
    const metadata = await buildBlockMetadata(homePage);
    return (
      <article className="pb-16">
        <Render config={blockConfig} data={toBlockData(homePage.blocks)} metadata={metadata} />
      </article>
    );
  }

  if (!content) {
    return (
      <section className="site-wrap py-24 text-center">
        <h1 className="display-2">Le contenu de l'accueil n'est pas encore rédigé.</h1>
        <p className="mt-3 text-muted">Renseignez-le dans l'administration, ou lancez le seed en développement.</p>
      </section>
    );
  }

  const featured = products.slice(0, content.catalogue.count);

  /*
   * Le dernier jour de l'offre, le héro cède la place au compte à rebours : l'accueil
   * n'a plus qu'une chose à dire, et deux grands héros empilés la diraient moins bien.
   * Sur une page composée en blocs, c'est le bloc « Dernier jour de l'offre » qui s'en
   * charge ; ici, sur l'accueil de repli — celui que sert la racine tant qu'aucune page
   * n'est désignée —, il n'y a pas de bloc où le déposer : la racine le porte
   * elle-même, et il n'y a donc rien à composer dans l'admin pour l'obtenir.
   */
  const lastDay = lastDayCountdown(settings.promos.collectionOffer);
  const collection = collectionState(toCollectionTitles(products), new Set(), true);

  return (
    <>
      {lastDay && collection.totalTitles > 1 ? (
        <LastDayOffer
          eyebrow="Dernier jour"
          heading="C'est le dernier jour pour profiter de l'offre."
          /* La photo du héro : l'affiche de la vidéo, à défaut une photo du récit. */
          image={content.hero.posterUrl ? { url: content.hero.posterUrl, alt: "" } : (content.howTo.image ?? content.story.image)}
          ctaLabel="Ajouter la collection au panier"
          secondary={{ label: "Découvrir les livres", href: systemPath("catalogue") }}
          endsAt={lastDay.endsAt}
          remaining={lastDay.remaining}
          titlesLabel={`Les ${collection.totalTitles} titres`}
          fullPrice={collection.fullPrice}
          offerPrice={collection.offerPrice}
        />
      ) : (
        <HomeHero hero={content.hero} />
      )}
      <Tiles tiles={content.tiles} />

      <section className="site-wrap flex flex-col gap-8 py-[4.5rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-6">
          <h2 className="display-2">{content.catalogue.heading}</h2>
          {content.catalogue.linkLabel && (
            <Link href={systemPath("catalogue")} className="rounded-pill bg-white px-[1.125rem] py-2.5 text-[0.8125rem] font-bold">
              {content.catalogue.linkLabel}
            </Link>
          )}
        </div>
        <div className="grid grid-cols-4 gap-5 max-[989px]:grid-cols-2 max-[479px]:grid-cols-1">
          {featured.map((p) => (
            <ProductCard key={p.slug} product={p} variant="compact" />
          ))}
        </div>
      </section>

      <Split
        eyebrow={content.howTo.eyebrow}
        heading={content.howTo.heading}
        text={content.howTo.text}
        image={content.howTo.image}
        cta={content.howTo.cta}
        mediaSide="left"
        tint={content.howTo.tint}
        ctaStyle="pill"
      />

      <Split
        eyebrow={content.story.eyebrow}
        heading={content.story.heading}
        text={content.story.text}
        image={content.story.image}
        cta={content.story.cta}
        mediaSide="right"
        ctaStyle="underline"
        mediaHeight={440}
      />

      <Newsletter {...content.newsletter} />
      <div className="h-16" />
    </>
  );
}

// Le contenu est édité dans l'admin : chaque visite doit refléter la dernière version.
export const dynamic = "force-dynamic";
