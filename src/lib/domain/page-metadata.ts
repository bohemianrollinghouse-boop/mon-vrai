import type { Metadata } from "next";
import partage from "@/assets/partage.jpg";
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
 * et que la page n'en propose pas de meilleure. C'est l'habillage du site, comme le
 * favicon, et non un média qu'on range dans la médiathèque.
 *
 * Elle est IMPORTÉE, et ne vit donc pas dans `public/` : ce dossier n'arrive pas en
 * production — App Hosting déploie la sortie « standalone » de Next, qui n'emporte que
 * les fichiers tracés. Seul `email-logo.png` y survit, parce qu'un `readFile` le
 * désigne au générateur de PDF ; `logo.svg`, `ping.txt` et les icônes de la PWA y
 * répondent 404 depuis toujours. Importée, la photo part dans `_next/static/`, servi
 * par le CDN, et ses dimensions viennent du fichier plutôt que d'un chiffre recopié.
 *
 * Elle est répétée partout où une route compose son propre `openGraph` : Next remplace
 * l'objet entier au segment le plus profond, si bien qu'une valeur posée à la racine ne
 * survit pas à une page qui en écrit un. Un repli oublié vaudrait donc une carte muette.
 */
export function shareImage(): { url: string; alt: string; width: number; height: number } {
  return {
    url: `${siteUrl()}${partage.src}`,
    alt: "Un enfant feuillette deux imagiers Mon Vrai posés sur un drap, dans la lumière du matin",
    width: partage.width,
    height: partage.height,
  };
}

/*
 * La carte de partage d'une page : `openGraph` ET `twitter` d'un seul tenant.
 *
 * Écrite ici, et nulle part ailleurs, parce que Next REMPLACE l'objet `openGraph` au
 * segment le plus profond au lieu de le compléter : une page qui n'en pose qu'un
 * morceau — l'image, par exemple — efface tout le reste. C'est ainsi qu'une fiche livre
 * se partageait sans `og:type` ni `og:site_name`, alors que la racine les posait.
 *
 * `og:url` dit QUELLE page est partagée. Sans lui, Facebook rattache les partages à ce
 * qu'il devine, et son outil de diagnostic le réclame ; il se déduit du chemin, jamais
 * d'un champ à remplir — une adresse recopiée à la main finit toujours par mentir.
 */
export function shareCard(card: {
  /** Chemin de la page, barre oblique comprise : « / » pour l'accueil. */
  path: string;
  title?: string;
  description?: string;
  siteName?: string;
  /** L'image propre à la page (couverture d'un livre, visuel choisi) ; à défaut, celle du site. */
  image?: { url: string; alt?: string; width?: number; height?: number };
}): Pick<Metadata, "openGraph" | "twitter"> {
  const image = card.image ?? shareImage();
  return {
    openGraph: {
      type: "website",
      siteName: card.siteName ?? "Mon Vrai",
      locale: "fr_FR",
      url: `${siteUrl()}${card.path}`,
      title: card.title,
      description: card.description,
      images: [{ url: image.url, alt: image.alt, width: image.width, height: image.height }],
    },
    twitter: {
      card: "summary_large_image",
      title: card.title,
      description: card.description,
      images: [image.url],
    },
  };
}

export function pageMetadata(page: Page): Metadata {
  const seo = page.seo;
  const title = seo.title || page.title;
  const description = seo.description;
  const shareTitle = seo.shareTitle || title;
  const shareDescription = seo.shareDescription || description;
  // L'accueil est servi à la racine : c'est elle, l'adresse canonique.
  const path = page.home ? "/" : pagePath(page.slug);

  return {
    title,
    description,
    alternates: { canonical: seo.canonical || `${siteUrl()}${path}` },
    // `noindex` n'enlève pas la page du site : elle reste accessible par son adresse.
    robots: seo.noindex ? { index: false, follow: true } : undefined,
    ...shareCard({ path, title: shareTitle, description: shareDescription, image: seo.image }),
  };
}
