import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AddToCartForm } from "@/components/site/AddToCartForm";
import { ctaLabel, joinItems, ProductCard } from "@/components/site/ProductCard";
import { Eyebrow, TINT_BG, TINT_INK } from "@/components/site/ui";
import { getProduct, listPublishedProducts } from "@/lib/db/products";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/*
 * Fiche produit. La maquette n'en propose pas : on compose avec ses éléments —
 * vignette teintée, surtitre, liste du contenu, caractéristiques, bouton pilule —
 * et l'on termine par les autres titres, pour compléter la collection.
 */

const BADGE_LABEL = { none: null, new: "Nouveauté", reissue: "Nouvelle édition" } as const;

export async function generateMetadata({ params }: PageProps<"/livres/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || product.status !== "published") return {};
  return {
    title: product.seo.title ?? product.title,
    description: product.seo.description ?? product.subtitle,
    openGraph: { images: product.images[0] ? [product.images[0].url] : [] },
  };
}

export default async function ProductPage({ params }: PageProps<"/livres/[slug]">) {
  const { slug } = await params;
  const [product, all] = await Promise.all([getProduct(slug), listPublishedProducts()]);
  if (!product || product.status !== "published") notFound();

  const others = all.filter((p) => p.slug !== product.slug).slice(0, 4);
  const badge = BADGE_LABEL[product.badge];
  const soldOut = product.stock !== null && product.stock <= 0 && !product.preorder.enabled;
  const shipFrom = product.preorder.enabled && product.preorder.shipFrom ? formatDate(product.preorder.shipFrom) : null;

  return (
    <>
      <section className="site-wrap pt-2">
        <div className="grid grid-cols-[1.1fr_1fr] gap-4 max-[899px]:grid-cols-1">
          <div className={`relative flex aspect-square items-center justify-center rounded-panel ${TINT_BG[product.tint]}`}>
            {product.images[0] && (
              <Image
                src={product.images[0].url}
                alt={product.images[0].alt || product.title}
                width={product.images[0].width ?? 900}
                height={product.images[0].height ?? 1200}
                sizes="(min-width: 900px) 50vw, 100vw"
                priority
                className="h-auto max-h-[80%] w-auto max-w-[80%] rounded-xl shadow-card"
              />
            )}
            {badge && <span className="absolute top-6 left-6 rounded-pill bg-white px-3 py-1.5 text-xs font-bold">{badge}</span>}
          </div>

          <div className="flex flex-col justify-center gap-6 rounded-panel bg-white p-16 max-[899px]:p-8">
            <div className="flex flex-col gap-3">
              <Eyebrow className="text-subtle">{product.ageLabel}</Eyebrow>
              <h1 className="display-1 text-[clamp(2rem,4.4vw,3.25rem)]">{product.title}</h1>
              {product.subtitle && <p className="text-[1.0625rem] leading-relaxed text-muted">{product.subtitle}</p>}
            </div>

            {product.items.length > 0 && (
              <p className={`rounded-card px-5 py-4 text-[0.9375rem] leading-relaxed ${TINT_BG[product.tint]} ${TINT_INK[product.tint]}`}>
                <strong className="text-ink">Dans ce livre :</strong> {joinItems(product.items)}.
              </p>
            )}

            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-[2rem] font-extrabold tracking-[-0.02em]">{formatEuro(product.price)}</span>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <s className="text-sm font-semibold text-subtle">{formatEuro(product.compareAtPrice)}</s>
              )}
              {shipFrom && <span className="text-sm font-semibold text-muted">Précommande · expédition à partir du {shipFrom}</span>}
            </div>

            <AddToCartForm slug={product.slug} label={ctaLabel(product)} disabled={soldOut} />

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-5 text-sm max-[479px]:grid-cols-1">
              <Row k="Format" v="Livre cartonné, 6 doubles-pages, 14 × 14 cm" />
              <Row k="Âge" v={product.ageLabel} />
              <Row k="Impression" v="Papier FSC, encre de soja, conforme EN 71" />
              {product.isbn && <Row k="ISBN" v={product.isbn} />}
            </dl>
          </div>
        </div>
      </section>

      {product.descriptionHtml && (
        <section className="site-wrap pt-4">
          <div className="prose-mv rounded-panel bg-white p-16 max-[899px]:p-8" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
        </section>
      )}

      {others.length > 0 && (
        <section className="site-wrap flex flex-col gap-8 py-[4.5rem]">
          <h2 className="display-2">Compléter la collection</h2>
          <div className="grid grid-cols-4 gap-5 max-[989px]:grid-cols-2 max-[479px]:grid-cols-1">
            {others.map((p) => (
              <ProductCard key={p.slug} product={p} variant="compact" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
