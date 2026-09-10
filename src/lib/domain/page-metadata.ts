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

export function pageMetadata(page: Page): Metadata {
  const seo = page.seo;
  const title = seo.title || page.title;
  const description = seo.description;
  const shareTitle = seo.shareTitle || title;
  const shareDescription = seo.shareDescription || description;
  // L'accueil est servi à la racine : c'est elle, l'adresse canonique.
  const url = `${siteUrl()}${page.home ? "/" : pagePath(page.slug)}`;

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
      images: seo.image ? [{ url: seo.image.url, alt: seo.image.alt, width: seo.image.width, height: seo.image.height }] : undefined,
    },
    twitter: {
      card: seo.image ? "summary_large_image" : "summary",
      title: shareTitle,
      description: shareDescription,
      images: seo.image ? [seo.image.url] : undefined,
    },
  };
}
