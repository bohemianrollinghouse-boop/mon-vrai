import type { MetadataRoute } from "next";
import { listPages } from "@/lib/db/pages";
import { listPublishedProducts } from "@/lib/db/products";
import { siteUrl } from "@/lib/domain/page-metadata";
import { pagePath } from "@/lib/domain/system-pages";

export const dynamic = "force-dynamic";

/*
 * Plan du site. Il manquait, et rien ne le remplaçait : les moteurs devaient deviner
 * l'arborescence en suivant les liens. Il se construit à la lecture, comme le reste —
 * une page publiée ou un livre ajouté y entre sans qu'on y pense.
 *
 * Seules les pages publiées et les livres en vente y figurent. Les pages marquées
 * « ne pas indexer » dans leur bloc de référencement en sont retirées : il serait
 * contradictoire de les proposer ici.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [pages, products] = await Promise.all([listPages("published").catch(() => []), listPublishedProducts().catch(() => [])]);

  const entries: MetadataRoute.Sitemap = [{ url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];

  for (const page of pages) {
    // La page d'accueil est déjà là, sous la racine : ne pas la lister deux fois.
    if (page.home || page.seo.noindex) continue;
    entries.push({ url: `${base}${pagePath(page.slug)}`, lastModified: new Date(page.updatedAt), changeFrequency: "monthly", priority: 0.6 });
  }

  for (const product of products) {
    entries.push({ url: `${base}/livres/${product.slug}`, lastModified: new Date(product.updatedAt), changeFrequency: "weekly", priority: 0.8 });
  }

  return entries;
}
