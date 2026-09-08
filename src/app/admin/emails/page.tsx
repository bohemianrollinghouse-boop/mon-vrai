import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, Input, PageHeader, Select } from "@/components/admin/ui";
import { sendTestEmailAction } from "@/lib/admin/actions/emails";
import { requireAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { sampleOrder } from "@/lib/email/sample";
import { orderConfirmationEmail, shippingNoticeEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

/*
 * Aperçu des e-mails transactionnels, avec des données fictives, et envoi d'un test.
 * Les gabarits sont dans lib/email/templates.ts ; leur contenu se nourrit des réglages
 * (nom, coordonnées, réseaux, date de précommande).
 */
export default async function EmailsPage() {
  const [user, settings] = await Promise.all([requireAdmin(), getSettings()]);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr";
  const order = sampleOrder();
  const previews = [
    { key: "confirmation", label: "Confirmation de commande", built: orderConfirmationEmail(order, settings, site), note: "Envoyé au paiement, avec la facture PDF en pièce jointe." },
    { key: "shipping", label: "Avis d'expédition", built: shippingNoticeEmail(order, settings, site), note: "Envoyé dès qu'un numéro de suivi est enregistré (Boxtal ou à la main)." },
  ];

  return (
    <>
      <PageHeader title="E-mails" subtitle="Aperçu des e-mails envoyés aux clients. Le contenu se met à jour depuis Paramètres (nom, coordonnées, réseaux, précommande)." />

      <Card title="Envoyer un test">
        <p className="text-[0.8125rem] text-muted">Un e-mail d'exemple (commande fictive) pour vérifier le rendu dans votre boîte.</p>
        <ActionForm action={sendTestEmailAction} submitLabel="Envoyer le test">
          <div className="grid grid-cols-2 gap-3 max-[599px]:grid-cols-1">
            <Field label="Modèle" name="template">
              <Select name="template" defaultValue="confirmation">
                <option value="confirmation">Confirmation de commande</option>
                <option value="shipping">Avis d'expédition</option>
              </Select>
            </Field>
            <Field label="Destinataire" name="to">
              <Input name="to" type="email" defaultValue={user.email} required />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <div className="grid grid-cols-2 gap-3 max-[1099px]:grid-cols-1">
        {previews.map((p) => (
          <Card key={p.key} title={p.label} aside={<span className="text-[0.6875rem] font-semibold text-subtle">Objet : {p.built.subject}</span>}>
            <p className="text-xs text-muted">{p.note}</p>
            <div className="overflow-hidden rounded-2xl border border-line-soft">
              <iframe title={p.label} srcDoc={p.built.html} className="h-[720px] w-full bg-white" sandbox="" />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
