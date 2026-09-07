import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPage } from "@/lib/db/pages";

export const dynamic = "force-dynamic";

/*
 * Pages libres, rédigées dans l'admin avec le WYSIWYG. Le HTML servi est celui figé à
 * la sauvegarde, produit par l'éditeur : pas d'entrée utilisateur brute ici.
 */

export async function generateMetadata({ params }: PageProps<"/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) return {};
  return { title: page.seo.title ?? page.title, description: page.seo.description };
}

export default async function FreePage({ params }: PageProps<"/pages/[slug]">) {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) notFound();

  return (
    <article className="site-wrap py-8">
      <div className="mx-auto max-w-[56rem] rounded-panel bg-white px-14 py-12 max-[749px]:px-6 max-[749px]:py-8">
        <h1 className="display-1 mb-8 text-[clamp(1.875rem,4vw,2.75rem)]">{page.title}</h1>
        <div className="prose-mv max-w-none" dangerouslySetInnerHTML={{ __html: page.body.html }} />
      </div>
    </article>
  );
}
