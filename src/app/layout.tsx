import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { StatsBeacon } from "@/components/site/StatsBeacon";
import { getSettings } from "@/lib/db/settings";
import { headers } from "next/headers";
import { shareCard } from "@/lib/domain/page-metadata";
import "./globals.css";

/*
 * Layout racine : la police et les métadonnées par défaut, rien d'autre. Le site
 * public ajoute son bandeau, son en-tête et son pied de page dans `(site)/layout.tsx` ;
 * l'administration a sa propre coquille dans `admin/layout.tsx` — deux univers qui ne
 * partagent que la police et les jetons.
 */

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const title = settings.seo.title ?? settings.shopName;
  /*
   * Carte de partage par défaut : celle des routes qui n'en composent pas elles-mêmes
   * (panier, recherche, compte, 404) — et celle de l'ACCUEIL tant qu'aucune page n'est
   * désignée comme telle, cas où la racine retombe sur `content/home` sans passer par
   * `pageMetadata`. C'est ce qui la privait d'`og:url`.
   *
   * Le chemin vient de l'en-tête posé par le proxy, et non d'un « / » écrit en dur :
   * `og:url` doit désigner la page partagée, pas l'accueil à sa place. Le lire ne coûte
   * aucun prérendu — ce layout interroge déjà les réglages, donc rien n'est statique ici.
   */
  const pathname = (await headers()).get("x-pathname") || "/";
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: title, template: `%s — ${settings.shopName}` },
    description: settings.seo.description,
    ...shareCard({ path: pathname, title, description: settings.seo.description, siteName: settings.shopName }),
    // Favicon et icônes : fichiers app/favicon.ico, app/icon.png, app/apple-icon.png (détectés par Next).
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
     * `suppressHydrationWarning` : le script Tampermonkey de COBA (relevé des posts
     * Facebook, voir /admin/facebook) pose `data-coba-fbg-script` sur <html> avant
     * l'hydratation, et React s'en plaignait à chaque page. Ne vaut que pour les
     * attributs de CET élément, pas pour ce qu'il contient.
     */
    <html lang="fr" className={`${montserrat.variable} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        {children}
        {/* Fréquentation (pages vues, présence), sans cookie ; ignore /admin de lui-même. */}
        <StatsBeacon />
      </body>
    </html>
  );
}
