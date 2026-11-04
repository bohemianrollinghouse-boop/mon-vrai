import type { Metadata } from "next";
import type { Page } from "./types";
import { pagePath } from "./system-pages";

/*
 * Métadonnées d'une page libre, à partir de son bloc SEO. Une seule fonction pour
 * les deux routes qui servent une page (la racine et l'attrape-tout), afin que
 * l'accueil et une page ordinaire produisent exactement les mêmes balises.
 *
 * Chaîne de repli assumée : partage → SEO → titre de la page. Un auteur qui ne
 * remplit rien obtient donc déjà un titre correct et une carte de partage lisible.
 */

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
}

/*
 * L'image de partage par défaut : la photo qui paraît quand on colle un lien du site
 * et que la page n'en propose pas de meilleure. Elle est servie depuis `public/` et non
 * depuis la médiathèque — c'est l'habillage du site, comme le favicon, pas un média
 * qu'on range.
 *
 * Elle est répétée partout où une route compose son propre `openGraph` : Next remplace
 * l'objet entier au segment le plus profond, si bien qu'une valeur posée à la racine ne
 * survit pas à une page qui en écrit un. Un repli oublié vaudrait donc une carte muette.
 */
export function shareImage(): { url: string; alt: string; width: number; height: number } {
  return {
    url: `${siteUrl()}/partage.jpg`,
    alt: "Un enfant feuillette deux imagiers Mon Vrai posés sur un drap, dans la lumière du matin",
    width: 1200,
    height: 630,
  };
}

export function pageMetadata(page: Page): Metadata {
  const seo = page.seo;
  const title = seo.title || page.title;
  const description = seo.description;
  const shareTitle = seo.shareTitle || title;
  const shareDescription = seo.shareDescription || description;
  // L'accueil est servi à la racine : c'est elle, l'adresse canonique.
  const url = `${siteUrl()}${page.home ? "/" : pagePath(page.slug)}`;
  const image = seo.image ?? shareImage();

  return {
    title,
    description,
    alternates: { canonical: seo.canonical || url },
    // `noindex` n'enlève pas la page du site : elle reste accessible par son adresse.
    robots: seo.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      siteName: "Mon Vrai",
      locale: "fr_FR",
      url,
      title: shareTitle,
      description: shareDescription,
      images: [{ url: image.url, alt: image.alt, width: image.width, height: image.height }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      images: [image.url],
    },
  };
}
