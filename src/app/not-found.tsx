import { Announcement } from "@/components/site/Announcement";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { NotFoundBody } from "@/components/site/NotFoundBody";

/*
 * 404 racine, pour les adresses qui ne tombent dans aucun groupe (Next l'exige à la
 * racine). Elle est hors de `(site)` : on y remet la coquille du site à la main. Les
 * adresses du site public, elles, passent par `(site)/not-found.tsx`, qui hérite de la
 * coquille — sans quoi en-tête et pied de page s'afficheraient deux fois.
 */
export default function NotFound() {
  return (
    <>
      <Announcement />
      <Header />
      <main id="contenu" className="flex-1">
        <NotFoundBody />
      </main>
      <Footer />
    </>
  );
}
