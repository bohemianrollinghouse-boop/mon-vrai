import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Checkbox, Field, Input, PageHeader, Pill, Switch, Textarea } from "@/components/admin/ui";
import { saveSettingsAction } from "@/lib/admin/actions/settings";
import { getSettings } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();

  return (
    <>
      <PageHeader title="Réglages" subtitle="Identité, bandeau, coordonnées, livraison, réseaux." />
      <ActionForm action={saveSettingsAction}>
        <>
          <Card title="Identité">
            <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
              <Field label="Nom de la boutique" name="shopName">
                <Input name="shopName" defaultValue={s.shopName} required />
              </Field>
              <Field label="Accroche (pied de page)" name="tagline">
                <Input name="tagline" defaultValue={s.tagline} />
              </Field>
              <Field label="Titre SEO par défaut" hint="70 caractères max." name="seo.title">
                <Input name="seo.title" defaultValue={s.seo.title ?? ""} maxLength={70} />
              </Field>
              <Field label="Description SEO par défaut" hint="200 caractères max." name="seo.description">
                <Input name="seo.description" defaultValue={s.seo.description ?? ""} maxLength={200} />
              </Field>
            </div>
          </Card>

          <Card title="Bandeau d'annonce">
            <div className="flex flex-col gap-4">
              <Checkbox name="announcement.enabled" label="Afficher le bandeau" defaultChecked={s.announcement.enabled} />
              <Field label="Texte" name="announcement.text">
                <Input name="announcement.text" defaultValue={s.announcement.text} />
              </Field>
            </div>
          </Card>

          <Card title="Coordonnées">
            <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
              <Field label="E-mail public" name="contact.email">
                <Input name="contact.email" type="email" defaultValue={s.contact.email ?? ""} />
              </Field>
              <Field label="Téléphone" name="contact.phone">
                <Input name="contact.phone" defaultValue={s.contact.phone ?? ""} />
              </Field>
              <Field label="Adresse" hint="Une ligne par ligne d'adresse." className="col-span-2 max-[749px]:col-span-1">
                <Textarea name="contact.address" defaultValue={s.contact.addressLines.join("\n")} rows={3} />
              </Field>
            </div>
          </Card>

          <Card title="Réseaux sociaux">
            <div className="grid grid-cols-3 gap-4 max-[749px]:grid-cols-1">
              <Field label="Instagram" name="socials.instagram">
                <Input name="socials.instagram" type="url" placeholder="https://instagram.com/…" defaultValue={s.socials.instagram ?? ""} />
              </Field>
              <Field label="TikTok" name="socials.tiktok">
                <Input name="socials.tiktok" type="url" placeholder="https://tiktok.com/@…" defaultValue={s.socials.tiktok ?? ""} />
              </Field>
              <Field label="Facebook" name="socials.facebook">
                <Input name="socials.facebook" type="url" placeholder="https://facebook.com/…" defaultValue={s.socials.facebook ?? ""} />
              </Field>
            </div>
          </Card>

          <Card title="Livraison et précommande">
            <div className="grid grid-cols-3 gap-4 max-[749px]:grid-cols-1">
              <Field label="Livraison offerte à partir de (€)" hint="0 pour désactiver la jauge." name="shipping.freeThresholdEuros">
                <Input name="shipping.freeThresholdEuros" type="number" step="0.01" min="0" defaultValue={(s.shipping.freeThreshold / 100).toString()} />
              </Field>
              <Field label="Expédition des précommandes" hint="Date ISO, ex. 2026-12-25." name="shipping.preorderShipFrom">
                <Input name="shipping.preorderShipFrom" type="date" defaultValue={s.shipping.preorderShipFrom ?? ""} />
              </Field>
              <Field label="Pays livrés" hint="Codes à deux lettres, séparés par des virgules." name="shipping.countries">
                <Input name="shipping.countries" defaultValue={s.shipping.countries.join(", ")} />
              </Field>
            </div>
          </Card>

          <div id="paiements">
            <Card title="Paiements">
              <div className="flex flex-col gap-4">
                <Switch
                  name="payments.testMode"
                  label="Paiements en mode test"
                  hint="Utilise les clés Stripe de test : payez avec la carte 4242 4242 4242 4242 (n'importe quelle date future et n'importe quel CVC). Les commandes sont marquées « Test », exclues du chiffre d'affaires et sans facture. Décochez pour encaisser réellement."
                  defaultChecked={s.payments.mode === "test"}
                />
                <div className="flex items-center gap-2 text-xs text-subtle">
                  Mode actuel :
                  {s.payments.mode === "test" ? <Pill tone="warn">Test</Pill> : <Pill tone="ok">Production (paiements réels)</Pill>}
                </div>
              </div>
            </Card>
          </div>
          <Card title="Bas de page">
            <Field label="Ligne légale" hint="Affichée à droite du copyright ; vide pour rien." name="legal.footerLine">
              <Input name="legal.footerLine" defaultValue={s.legal.footerLine} />
            </Field>
          </Card>

          <Card title="Factures">
            <p className="mb-4 text-sm text-muted">
              Mentions imprimées en en-tête de chaque facture PDF. Une facture est émise automatiquement à chaque paiement ; son numéro est séquentiel et
              définitif.
            </p>
            <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
              <Field label="Raison sociale" hint="Vide : le nom de la boutique est utilisé." name="legal.sellerName">
                <Input name="legal.sellerName" defaultValue={s.legal.sellerName} />
              </Field>
              <Field label="Adresse du vendeur" hint="Une ligne par ligne d'adresse." name="legal.sellerAddress">
                <Textarea name="legal.sellerAddress" rows={3} defaultValue={s.legal.sellerAddressLines.join("\n")} />
              </Field>
              <Field label="SIRET" name="legal.siret">
                <Input name="legal.siret" defaultValue={s.legal.siret} />
              </Field>
              <Field label="Numéro de TVA intracommunautaire" hint="Vide si vous n'êtes pas assujetti." name="legal.vatNumber">
                <Input name="legal.vatNumber" defaultValue={s.legal.vatNumber} />
              </Field>
              <Field label="Mention TVA" hint="Imprimée quand aucune taxe n'est facturée." className="col-span-2 max-[749px]:col-span-1" name="legal.vatNote">
                <Input name="legal.vatNote" defaultValue={s.legal.vatNote} />
              </Field>
            </div>
          </Card>
        </>
      </ActionForm>
    </>
  );
}
