import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, GridTable, Input, PageHeader, Pill, Textarea } from "@/components/admin/ui";
import { NewsletterSend } from "@/components/admin/NewsletterSend";
import { requireAdmin } from "@/lib/auth/session";
import { saveNewsletterContentAction } from "@/lib/admin/actions/newsletter";
import { buyerEmailsByProduct, getNewsletterContent, listSubscribers } from "@/lib/db/newsletter";
import { listPublishedProducts } from "@/lib/db/products";

export const dynamic = "force-dynamic";

/*
 * Newsletter : liste des inscrits, contenu éditable (gabarit fixe), et envoi ciblé.
 * Une personne (test), tous les inscrits, tous les acheteurs, ou les acheteurs d'un titre.
 */
export default async function NewsletterPage() {
  const user = await requireAdmin();
  const [content, subscribers, products, byProduct] = await Promise.all([getNewsletterContent(), listSubscribers(), listPublishedProducts(), buyerEmailsByProduct()]);

  const subEmails = new Set(subscribers.map((s) => s.email));
  const buyers = new Set<string>();
  for (const set of byProduct.values()) for (const e of set) if (subEmails.has(e)) buyers.add(e);
  const counts = { all: subscribers.length, buyers: buyers.size };

  return (
    <>
      <PageHeader title="Newsletter" subtitle={`${subscribers.length} inscrit${subscribers.length > 1 ? "s" : ""}`} />

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4 max-[1099px]:grid-cols-1">
        <Card title="Contenu de la newsletter" aside={<span className="text-xs text-subtle">Gabarit fixe · seul le contenu change</span>}>
          <ActionForm action={saveNewsletterContentAction} submitLabel="Enregistrer le contenu">
            <Field label="Sujet de l'e-mail" name="subject">
              <Input name="subject" defaultValue={content.subject} placeholder="Des nouvelles de Mon Vrai" />
            </Field>
            <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
              <Field label="Surtitre" name="eyebrow">
                <Input name="eyebrow" defaultValue={content.eyebrow} placeholder="Newsletter" />
              </Field>
              <Field label="Titre" name="heading">
                <Input name="heading" defaultValue={content.heading} placeholder="Le titre de votre message" />
              </Field>
            </div>
            <Field label="Message" hint="Une ligne vide sépare les paragraphes." name="body">
              <Textarea name="body" rows={9} defaultValue={content.body} placeholder="Bonjour,&#10;&#10;Voici les nouveautés du moment…" />
            </Field>
            <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
              <Field label="Bouton (texte)" name="cta.label">
                <Input name="cta.label" defaultValue={content.cta.label} placeholder="Voir le catalogue" />
              </Field>
              <Field label="Bouton (lien)" name="cta.href">
                <Input name="cta.href" defaultValue={content.cta.href} placeholder="https://monvrai.fr/catalogue" />
              </Field>
            </div>
            <Field label="Image en tête (URL, facultatif)" name="imageUrl">
              <Input name="imageUrl" defaultValue={content.imageUrl} placeholder="https://…" />
            </Field>
          </ActionForm>
        </Card>

        <Card title="Envoyer">
          <NewsletterSend products={products.map((p) => ({ slug: p.slug, title: p.title }))} adminEmail={user.email} counts={counts} />
        </Card>
      </div>

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
