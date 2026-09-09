import type { Metadata } from "next";
import { Newsletter } from "@/components/site/Newsletter";
import { PreorderCollectionCard } from "@/components/site/PreorderCollectionCard";
import { ProductCard } from "@/components/site/ProductCard";
import { SortSelect } from "@/components/site/SortSelect";
import { Chip, Eyebrow, PillLink, TINT_BG, TINT_INK } from "@/components/site/ui";
import { getCatalogueContent, getHomeContent } from "@/lib/db/content";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { collectionState, toCollectionTitles } from "@/lib/promos/collection";
import type { Product } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Catalogue" };
export const dynamic = "force-dynamic";

/*
 * Page catalogue (maquette 3a) : bandeau teinté avec l'offre groupée, barre de tri,
 * grille de cartes détaillées, bande de caractéristiques, newsletter.
 */

type Sort = "position" | "title-asc" | "title-desc" | "price-asc" | "price-desc";
const SORTS: { value: Sort; label: string }[] = [
  { value: "position", label: "En vedette" },
  { value: "title-asc", label: "Alphabétique, A à Z" },
  { value: "title-desc", label: "Alphabétique, Z à A" },
  { value: "price-asc", label: "Prix croissant" },
  { value: "price-desc", label: "Prix décroissant" },
];

function sortProducts(products: Product[], sort: Sort): Product[] {
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

export default async function CataloguePage({ searchParams }: PageProps<"/catalogue">) {
  const { tri } = await searchParams;
  const sort = (SORTS.some((s) => s.value === tri) ? tri : "position") as Sort;

  const [products, content, home, settings] = await Promise.all([listPublishedProducts(), getCatalogueContent(), getHomeContent(), getSettings()]);
  const sorted = sortProducts(products, sort);
  const hero = content?.hero;
  const offer = content?.offer;
  // Encart « Précommander la collection » : uniquement si l'offre collection est activée.
  const collection = collectionState(toCollectionTitles(products), new Set(), settings.promos.collectionOffer.enabled);
  const showCollectionOffer = collection.enabled && collection.totalTitles > 1;

  return (
    <>
      {hero && (
        <section className="site-wrap pt-2">
          <div className={`grid grid-cols-[1.2fr_1fr] items-end gap-10 rounded-panel px-16 py-14 max-[899px]:grid-cols-1 max-[899px]:items-stretch max-[899px]:px-7 max-[899px]:py-9 ${TINT_BG[hero.tint]}`}>
            <div className="flex flex-col gap-4">
              {hero.eyebrow && <Eyebrow className={TINT_INK[hero.tint]}>{hero.eyebrow.replace("[count]", String(products.length))}</Eyebrow>}
              <h1 className="display-1 text-[clamp(2rem,4.4vw,3.25rem)]">{hero.heading}</h1>
              {hero.text && <p className={`max-w-[520px] text-[1.0625rem] leading-relaxed ${TINT_INK[hero.tint]}`}>{hero.text}</p>}
            </div>
            {offer?.enabled && (
              <div className="flex flex-col gap-3 rounded-card bg-white p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[0.9375rem] font-bold">{offer.title}</span>
                  {offer.compareAt && <s className="text-[0.8125rem] font-semibold text-subtle">{offer.compareAt}</s>}
                </div>
                <span className="text-[2rem] font-extrabold tracking-[-0.02em]">{offer.price}</span>
                {offer.note && <span className="text-[0.8125rem] leading-relaxed text-muted">{offer.note}</span>}
                {offer.cta.label && (
                  <PillLink href={offer.cta.href || "/catalogue"} variant="dark" className="text-center text-[0.8125rem]">
                    {offer.cta.label}
                  </PillLink>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {showCollectionOffer && <PreorderCollectionCard totalTitles={collection.totalTitles} fullPrice={collection.fullPrice} offerPrice={collection.offerPrice} />}

      <section className="site-wrap flex flex-wrap items-center justify-between gap-4 pt-8 max-[749px]:items-start">
        <div className="flex flex-wrap gap-2">
          <Chip active>Tous</Chip>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[0.8125rem] font-semibold">
          <span className="text-subtle">
            {products.length} {products.length > 1 ? "articles" : "article"}
          </span>
          <SortSelect value={sort} options={SORTS} />
        </div>
      </section>

      <section className="site-wrap pt-6 pb-[4.5rem]">
        {sorted.length > 0 ? (
          <div className="grid grid-cols-3 gap-5 max-[989px]:grid-cols-2 max-[599px]:grid-cols-1">
            {sorted.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        ) : (
          <p className="text-[0.9375rem] text-muted">Aucun livre publié pour le moment.</p>
        )}
      </section>

      {content && content.specs.length > 0 && (
        <section className="site-wrap">
          <div className="grid grid-cols-3 overflow-hidden rounded-panel bg-white max-[899px]:grid-cols-1">
            {content.specs.map((s, i) => (
              <div
                key={s.title}
                className={`flex flex-col gap-2.5 p-10 ${i < content.specs.length - 1 ? "border-r border-line max-[899px]:border-r-0 max-[899px]:border-b" : ""}`}
              >
                <span className="text-xl font-extrabold">{s.title}</span>
                <span className="text-sm leading-relaxed text-muted">{s.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {home && <Newsletter {...home.newsletter} />}
      <div className="h-16" />
    </>
  );
}
