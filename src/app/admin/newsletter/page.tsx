import { Card, GridTable, PageHeader, Pill } from "@/components/admin/ui";
import { NewsletterComposer } from "@/components/admin/NewsletterComposer";
import { requireAdmin } from "@/lib/auth/session";
import { buyerEmailsByProduct, getAllTemplateValues, listSubscribers } from "@/lib/db/newsletter";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import type { Brand } from "@/lib/newsletter/render";

export const dynamic = "force-dynamic";

/*
 * Newsletter : liste des inscrits, et un composeur par modèles riches (Lancement, Nouveau
 * livre, Nouveau produit, Nouvelle catégorie…). On édite les textes/images d'un modèle et
 * on l'envoie à l'audience choisie ; le gabarit est fixe.
 */
export default async function NewsletterPage() {
  const user = await requireAdmin();
  const [savedValues, subscribers, products, byProduct, settings] = await Promise.all([getAllTemplateValues(), listSubscribers(), listPublishedProducts(), buyerEmailsByProduct(), getSettings()]);

  const subEmails = new Set(subscribers.map((s) => s.email));
  const buyers = new Set<string>();
  for (const set of byProduct.values()) for (const e of set) if (subEmails.has(e)) buyers.add(e);
  const counts = { all: subscribers.length, buyers: buyers.size };

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const brand: Brand = {
    shopName: settings.shopName,
    logoUrl: `${base}/email-logo.png`,
    address: settings.contact.addressLines.filter(Boolean).join(", "),
    instagram: settings.socials.instagram,
    tiktok: settings.socials.tiktok,
    facebook: settings.socials.facebook,
  };

  return (
    <>
      <PageHeader title="Newsletter" subtitle={`${subscribers.length} inscrit${subscribers.length > 1 ? "s" : ""}`} />

      <NewsletterComposer saved={savedValues} products={products.map((p) => ({ slug: p.slug, title: p.title }))} adminEmail={user.email} counts={counts} brand={brand} base={base} />

      <Card title={`Inscrits (${subscribers.length})`} className="mt-4">
        <GridTable
          columns="1.4fr 1fr auto auto"
          head={["E-mail", "Nom", "Origine", "Inscrit le"]}
          empty="Aucun inscrit pour l'instant."
          rows={subscribers.slice(0, 500).map((s) => ({
            key: s.email,
            cells: [
              <span key="e" className="truncate font-semibold">
                {s.email}
              </span>,
              <span key="n" className="text-muted">
                {s.name || "—"}
              </span>,
              <Pill key="o" tone={s.source === "compte" ? "ok" : "neutral"}>
                {s.source}
              </Pill>,
              <span key="d" className="text-subtle">
                {s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
              </span>,
            ],
          }))}
        />
      </Card>
    </>
  );
}
