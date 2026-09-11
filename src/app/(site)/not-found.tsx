import { NotFoundBody } from "@/components/site/NotFoundBody";

/*
 * 404 du site public. Elle existe pour une raison précise : la route attrape-tout
 * `[...slug]` répond à toute adresse inconnue et appelle `notFound()`. Sans cette
 * limite-ci, Next remontait jusqu'à la 404 racine — qui remet la coquille à la main —
 * et l'affichait DANS la coquille du groupe : en-tête et pied de page en double.
 *
 * Ici, la mise en page de `(site)` fournit déjà bandeau, en-tête, <main> et pied.
 */
export default function SiteNotFound() {
  return <NotFoundBody />;
}
