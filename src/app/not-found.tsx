import { Announcement } from "@/components/site/Announcement";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { PillLink } from "@/components/site/ui";
import { systemPath } from "@/lib/domain/system-pages";

/*
 * 404 globale. Elle vit à la racine (exigence de Next pour les URL inconnues), donc
 * hors du groupe `(site)` : on remet la coquille du site à la main.
 */
export default function NotFound() {
  return (
    <>
      <Announcement />
      <Header />
      <main id="contenu" className="flex-1">
        <section className="site-wrap py-16">
          <div className="mx-auto flex max-w-[640px] flex-col items-center gap-4 rounded-panel bg-white p-16 text-center max-[599px]:px-6 max-[599px]:py-9">
            <span className="eyebrow text-subtle">Erreur 404</span>
            <h1 className="display-2">Pas encore dans nos pages</h1>
            <p className="leading-relaxed text-muted">Cette adresse ne mène nulle part. Les imagiers, eux, sont bien là.</p>
            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <PillLink href={systemPath("catalogue")} variant="dark" className="text-[0.8125rem]">
                Voir le catalogue
              </PillLink>
              <PillLink href="/" variant="paper" className="text-[0.8125rem]">
                Retour à l'accueil
              </PillLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
