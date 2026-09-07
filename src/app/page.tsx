import Link from "next/link";
import { HomeHero, Split, Tiles } from "@/components/site/home-sections";
import { Newsletter } from "@/components/site/Newsletter";
import { ProductCard } from "@/components/site/ProductCard";
import { getHomeContent } from "@/lib/db/content";
import { listPublishedProducts } from "@/lib/db/products";
import { systemPath } from "@/lib/domain/system-pages";

/*
 * Page d'accueil (maquette 2a). Le contenu vient du document `content/home`, les
 * livres du catalogue publié. Sans contenu, on affiche un état vide explicite plutôt
 * qu'une page cassée : c'est ce que voit un site tout neuf avant le seed.
 */
export default async function HomePage() {
  const [content, products] = await Promise.all([getHomeContent(), listPublishedProducts()]);

  if (!content) {
    return (
      <section className="site-wrap py-24 text-center">
        <h1 className="display-2">Le contenu de l'accueil n'est pas encore rédigé.</h1>
        <p className="mt-3 text-muted">Renseignez-le dans l'administration, ou lancez le seed en développement.</p>
      </section>
    );
  }

  const featured = products.slice(0, content.catalogue.count);

  return (
    <>
      <HomeHero hero={content.hero} />
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
