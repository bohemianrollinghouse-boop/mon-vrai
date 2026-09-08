import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accordion } from "@/components/site/Accordion";
import { AddToCartForm } from "@/components/site/AddToCartForm";
import { Split } from "@/components/site/home-sections";
import { ProductCard, joinItems } from "@/components/site/ProductCard";
import { ProductGallery } from "@/components/site/ProductGallery";
import { PillLink, TINT_BG } from "@/components/site/ui";
import { getHomeContent } from "@/lib/db/content";
import { getProduct, listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { formatEuro, formatEuroShort } from "@/lib/domain/money";
import { systemPath } from "@/lib/domain/system-pages";

export const dynamic = "force-dynamic";

/*
 * Fiche produit (maquette 9a) : fil d'Ariane, galerie cliquable sur fond teinté,
 * colonne d'achat collante (compteur, bouton avec total, précommande, quatre tuiles,
 * accordéon), puis les six objets du livre, « comment l'utiliser » et la collection.
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
  const [product, all, settings, home] = await Promise.all([getProduct(slug), listPublishedProducts(), getSettings(), getHomeContent()]);
  if (!product || product.status !== "published") notFound();

  // Même teinte d'abord (la « famille »), puis les autres : quatre titres.
  const related = [...all.filter((p) => p.slug !== product.slug && p.tint === product.tint), ...all.filter((p) => p.slug !== product.slug && p.tint !== product.tint)].slice(0, 4);
  const badge = BADGE_LABEL[product.badge];
  const soldOut = product.stock !== null && product.stock <= 0 && !product.preorder.enabled;
  const shipFromIso = product.preorder.enabled ? product.preorder.shipFrom || settings.shipping.preorderShipFrom : undefined;
  const shipFrom = shipFromIso ? formatDate(shipFromIso) : null;
  const carriers = settings.shipping.rates.filter((r) => r.enabled).map((r) => r.name.split(" — ")[0]);
  const countries = settings.shipping.countries.map(countryName);
  const free = settings.shipping.freeThreshold;

  const accordion = [
    {
      title: "Ce qu'il y a dedans",
      body: product.descriptionHtml ? (
        <div className="prose-mv text-sm" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
      ) : (
        <p>Six doubles pages cartonnées, une vraie photo par page sur fond blanc, sans texte ni décor{product.items.length ? ` : ${joinItems(product.items)}.` : "."}</p>
      ),
    },
    {
      title: "Livraison & retours",
      body: (
        <p>
          {shipFrom ? `Expédition à partir du ${shipFrom}` : "Expédition sous 2 jours ouvrés"}
          {carriers.length ? ` via ${listFr(carriers)}` : ""} ({listFr(countries)}).{free ? ` Livraison offerte dès ${formatEuroShort(free)}.` : ""} 14 jours pour changer d'avis après réception.
        </p>
      ),
    },
    {
      title: "Entretien & sécurité",
      body: <p>Pages cartonnées épaisses, coins arrondis, finition mate qui s'essuie d'un chiffon humide. Conforme à la norme EN 71 (jouets).</p>,
    },
  ];

  return (
    <>
      <nav aria-label="Fil d'Ariane" className="site-wrap pt-2 text-xs font-semibold text-subtle">
        <Link href="/" className="hover:text-ink">
          Accueil
        </Link>
        <span aria-hidden="true"> › </span>
        <Link href={systemPath("catalogue")} className="hover:text-ink">
          Catalogue
        </Link>
        <span aria-hidden="true"> › </span>
        <span className="text-ink">{product.title}</span>
      </nav>

      <section className="site-wrap grid grid-cols-[1.1fr_1fr] items-start gap-5 pt-5 max-[899px]:grid-cols-1">
        <ProductGallery images={product.images} tint={product.tint} badge={badge} title={product.title} />

        <div className="sticky top-24 flex flex-col gap-6 max-[899px]:static">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-tint-green-ink">{product.ageLabel}</span>
            <h1 className="text-[clamp(2rem,3.6vw,2.875rem)] font-extrabold leading-[1.04] tracking-[-0.02em]">{product.title}</h1>
            {product.subtitle && <p className="text-base leading-[1.55] text-[#555]">{product.subtitle}</p>}
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[2rem] font-extrabold tracking-[-0.02em]">{formatEuroShort(product.price)}</span>
            {product.compareAtPrice && product.compareAtPrice > product.price && <s className="text-sm font-semibold text-subtle">{formatEuro(product.compareAtPrice)}</s>}
            <span className="text-[0.8125rem] font-semibold text-subtle">TTC{free ? ` · livraison offerte dès ${formatEuroShort(free)}` : ""}</span>
          </div>

          <AddToCartForm slug={product.slug} verb={product.preorder.enabled ? "Précommander" : "Ajouter au panier"} unitPrice={product.price} disabled={soldOut} note={shipFrom ? `Précommande · expédition à partir du ${shipFrom}` : product.stock !== null && product.stock > 0 && product.stock <= 5 ? `Plus que ${product.stock} exemplaire${product.stock > 1 ? "s" : ""}` : undefined} />

          <div className="grid grid-cols-2 gap-2.5 max-[479px]:grid-cols-1">
            <Tile k="Format" v={`14 × 14 cm · ${product.items.length || 6} doubles pages`} />
            <Tile k="Fabrication" v="Cartonné · FSC · encre de soja" />
            <Tile k="Sécurité" v="Conforme EN 71 · coins arrondis" />
            <Tile k="Référence" v={product.isbn || `MV-${product.slug.toUpperCase().replace(/-/g, "-").slice(0, 18)}`} />
          </div>

          <Accordion items={accordion} />
        </div>
      </section>

      {product.items.length > 0 && (
        <section className="site-wrap mt-14 grid grid-cols-6 gap-3 max-[899px]:grid-cols-3 max-[479px]:grid-cols-2" aria-label="Contenu du livre">
          {product.items.map((item) => (
            <div key={item} className="flex aspect-square flex-col items-center justify-center gap-2.5 rounded-[20px] bg-white p-4 text-center">
              <span className={`h-14 w-14 rounded-pill ${TINT_BG[product.tint]}`} aria-hidden="true" />
              <span className="text-sm font-bold">{capitalize(item)}</span>
            </div>
          ))}
        </section>
      )}

      {home?.howTo.heading && <Split eyebrow={home.howTo.eyebrow} heading={home.howTo.heading} text={home.howTo.text} image={home.howTo.image} cta={{ label: "", href: "" }} mediaSide="left" ctaStyle="underline" mediaHeight={440} />}

      {related.length > 0 && (
        <section className="site-wrap flex flex-col gap-6 py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-[1.75rem] font-extrabold tracking-[-0.01em]">Dans la même collection</h2>
            <PillLink href={systemPath("catalogue")} variant="light" size="sm">
              Les {all.length} imagiers →
            </PillLink>
          </div>
          <div className="grid grid-cols-4 gap-5 max-[989px]:grid-cols-2 max-[479px]:grid-cols-1">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} variant="compact" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-thumb bg-white p-4">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">{k}</span>
      <span className="text-sm font-bold">{v}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function listFr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
