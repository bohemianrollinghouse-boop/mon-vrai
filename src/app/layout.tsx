import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Announcement } from "@/components/site/Announcement";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { getSettings } from "@/lib/db/settings";
import "./globals.css";

/*
 * Layout racine : la police de la maquette, puis bandeau, en-tête, page, pied de page.
 * Les métadonnées par défaut viennent des réglages ; chaque page peut les préciser.
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
    title: { default: title, template: `%s — ${settings.shopName}` },
    description: settings.seo.description,
    icons: { icon: "/logo.svg" },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${montserrat.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Announcement />
        <Header />
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
