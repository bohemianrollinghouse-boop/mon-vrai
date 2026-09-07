import type { ReactNode } from "react";
import { Announcement } from "@/components/site/Announcement";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

/** Coquille du site public : bandeau, en-tête, page, pied de page. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Announcement />
      <Header />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
