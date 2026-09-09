import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { getSettings } from "@/lib/db/settings";
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
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: title, template: `%s - ${settings.shopName}` },
    description: settings.seo.description,
    // Favicon et icônes : fichiers app/favicon.ico, app/icon.png, app/apple-icon.png (détectés par Next).
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${montserrat.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
