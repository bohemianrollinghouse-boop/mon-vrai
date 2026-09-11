import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/domain/page-metadata";

/*
 * robots.txt. Il manquait : les moteurs le demandaient une cinquantaine de fois par
 * semaine et recevaient une 404. Une route plutôt qu'un fichier statique, pour que
 * l'adresse du plan du site suive l'origine configurée.
 *
 * Tout est ouvert sauf ce qui n'a rien à faire dans un index : l'administration, les
 * routes d'API, l'espace partenaire et le tunnel d'achat (pages privées ou sans
 * contenu propre). Le plan du site les exclut aussi, forcément.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/compte", "/commande", "/partenaire", "/panier", "/recherche"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
