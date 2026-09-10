import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { blockConfig, toBlockData } from "@/lib/blocks/config";
import { buildBlockMetadata } from "@/lib/blocks/metadata";
import { getPublishedPage } from "@/lib/db/pages";
import { isReservedPath } from "@/lib/domain/system-pages";
import { pageMetadata } from "@/lib/domain/page-metadata";

export const dynamic = "force-dynamic";

/*
 * Pages libres, composées en blocs dans l'admin et rendues ici côté serveur. Elles
 * vivent à leur adresse, directement sous la racine (/notre-histoire) : cette route
 * attrape tout ce qu'aucune route statique du site n'a pris. D'où le garde-fou sur
 * les segments réservés — sans lui, /admin/inconnu viendrait chercher une page.
 *
 * Une page antérieure à l'éditeur de blocs n'a qu'un corps de texte riche : on sert
 * son HTML figé jusqu'à son premier enregistrement en blocs. Pas d'entrée brute.
 */

/** Le chemin demandé, tel qu'il est stocké : les segments recollés par des « / ». */
function pathFrom(segments: string[]): string {
  return segments.map(decodeURIComponent).join("/");
}

export async function generateMetadata({ params }: PageProps<"/[...slug]">): Promise<Metadata> {
  const { slug } = await params;
  const path = pathFrom(slug);
  if (isReservedPath(path)) return {};
  const page = await getPublishedPage(path);
  return page ? pageMetadata(page) : {};
}

export default async function FreePage({ params, searchParams }: PageProps<"/[...slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const path = pathFrom(slug);
  if (isReservedPath(path)) notFound();
  const page = await getPublishedPage(path);
  if (!page) notFound();
  // La page d'accueil n'a qu'une adresse : la racine.
  if (page.home) redirect("/");

  /*
   * Une page de blocs se rend pleine largeur : chaque bloc porte sa propre section et
   * son `site-wrap`, et c'est le bloc d'en-tête qui fournit le <h1>. L'ancien corps,
   * lui, garde le panneau blanc étroit et le titre de la page.
   */
  if (page.blocks) {
    // Données ambiantes : chargées seulement pour les blocs présents sur la page.
    const metadata = await buildBlockMetadata(page.blocks, typeof query.tri === "string" ? query.tri : undefined);
    return (
      <article className="pb-16">
        <Render config={blockConfig} data={toBlockData(page.blocks)} metadata={metadata} />
      </article>
    );
  }

  return (
    <article className="site-wrap py-8">
      <div className="mx-auto max-w-[56rem] rounded-panel bg-white px-14 py-12 max-[749px]:px-6 max-[749px]:py-8">
        <h1 className="display-1 mb-8 text-[clamp(1.875rem,4vw,2.75rem)]">{page.title}</h1>
        <div className="prose-mv max-w-none" dangerouslySetInnerHTML={{ __html: page.body.html }} />
      </div>
    </article>
  );
}
