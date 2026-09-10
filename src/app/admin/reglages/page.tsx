import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, Field, Input, PageHeader, Pill, Switch, Textarea } from "@/components/admin/ui";
import { PushSettings } from "@/components/admin/PushSettings";
import { ServiceModeSwitch } from "@/components/admin/ServiceModeSwitch";
import { saveSettingsAction } from "@/lib/admin/actions/settings";
import { getSettings } from "@/lib/db/settings";
import { stripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

/*
 * Paramètres : deux colonnes de cartes — boutique, paiement et stocks à gauche,
 * identité légale à droite — puis identité/SEO, réseaux et pied de page. Un seul
 * formulaire : le bouton « Enregistrer » de l'en-tête soumet tout. La livraison a sa
 * propre page (/admin/livraison) et sa propre action.
 */
export default async function SettingsPage() {
  const s = await getSettings();
  const formId = "settings-form";

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle="Boutique, paiement, stocks, identité légale."
        actions={
          <Button form={formId} tone="primary">
            Enregistrer
          </Button>
        }
      />
      <ActionForm id={formId} action={saveSettingsAction} hideFooter>
        <div className="grid grid-cols-2 items-start gap-3 max-[1099px]:grid-cols-1">
          <div className="flex flex-col gap-3">
            <Card title="Boutique">
              <Field label="Nom" name="shopName">
                <Input name="shopName" defaultValue={s.shopName} required className="!font-bold" />
              </Field>
              <Field label="E-mail de contact" hint="Affiché sur le site et sur les factures." name="contact.email">
                <Input name="contact.email" type="email" defaultValue={s.contact.email ?? ""} />
              </Field>
              <Field label="Téléphone" name="contact.phone">
                <Input name="contact.phone" defaultValue={s.contact.phone ?? ""} />
              </Field>
              <Field label="Adresse publique (pied de page)" hint="Une ligne par ligne d'adresse." name="contact.address">
                <Textarea name="contact.address" rows={2} defaultValue={s.contact.addressLines.join("\n")} className="!min-h-0" />
              </Field>
              <Field label="Bandeau d'annonce" name="announcement.text">
                <Input name="announcement.text" defaultValue={s.announcement.text} />
              </Field>
              <Switch name="announcement.enabled" label="Afficher le bandeau" defaultChecked={s.announcement.enabled} />
              <Field label="Date d'expédition annoncée (précommandes)" hint="Utilisée quand une fiche produit n'en précise pas." name="shipping.preorderShipFrom">
                <Input name="shipping.preorderShipFrom" type="date" defaultValue={s.shipping.preorderShipFrom ?? ""} className="!font-bold" />
              </Field>
            </Card>

            <div id="paiements">
              <Card title="Paiement">
                <div className="flex items-center justify-between gap-3 rounded-[14px] bg-paper px-4 py-3.5 text-[0.8125rem]">
                  <div className="flex flex-col">
                    <span className="font-bold">Stripe</span>
                    <span className="text-xs text-subtle">Carte, Apple Pay, Google Pay{s.payments.paypal ? ", PayPal" : ""} · clés {s.payments.mode === "test" ? "de test" : "de production"}</span>
                  </div>
                  {stripeConfigured(s.payments.mode) ? (
                    <span className="rounded-pill bg-tint-green px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-green-ink">Connecté</span>
                  ) : (
                    <span className="rounded-pill bg-tint-pink px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-pink-ink">Clé manquante</span>
                  )}
                </div>
                <ServiceModeSwitch service="stripe" mode={s.payments.mode} label="Stripe (paiements)" />
                <Switch
                  name="payments.paypal"
                  label={
                    <span className="flex items-center gap-2">
                      Proposer PayPal à la caisse {s.payments.paypal && <Pill tone="ok">activé</Pill>}
                    </span>
                  }
                  hint="À activer d'abord dans votre compte Stripe (Paramètres → Moyens de paiement → PayPal). Sans cela, PayPal n'apparaît pas."
                  defaultChecked={s.payments.paypal}
                />
              </Card>
            </div>

            <Card title="Stocks">
              <Field label="Seuil « stock bas »" hint="En dessous de ce nombre d'exemplaires, le titre est signalé (badge Stocks, tableau de bord)." name="inventory.lowThreshold">
                <Input name="inventory.lowThreshold" type="number" min={0} defaultValue={s.inventory.lowThreshold} className="!font-bold" />
              </Field>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <Card title="Identité légale">
              <p className="text-[0.8125rem] text-muted">Identité de la boutique : mention TVA à la caisse, expéditeur des colis, pages légales du site. Les factures sont émises dans Tiime.</p>
              <div className="grid grid-cols-2 gap-3 max-[749px]:grid-cols-1">
                <Field label="Raison sociale" hint="Vide : le nom de la boutique." name="legal.sellerName">
                  <Input name="legal.sellerName" defaultValue={s.legal.sellerName} />
                </Field>
                <Field label="SIRET" name="legal.siret">
                  <Input name="legal.siret" defaultValue={s.legal.siret} />
                </Field>
                <Field label="Adresse du vendeur" hint="Une ligne par ligne." name="legal.sellerAddress" className="col-span-2 max-[749px]:col-span-1">
                  <Textarea name="legal.sellerAddress" rows={3} defaultValue={s.legal.sellerAddressLines.join("\n")} className="!min-h-0" />
                </Field>
                <Field label="N° TVA intracommunautaire" hint="Vide si non assujetti." name="legal.vatNumber">
                  <Input name="legal.vatNumber" defaultValue={s.legal.vatNumber} />
                </Field>
                <Field label="Mention TVA" hint="Imprimée quand aucune taxe n'est facturée." name="legal.vatNote">
                  <Input name="legal.vatNote" defaultValue={s.legal.vatNote} />
                </Field>
              </div>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-3 items-start gap-3 max-[1099px]:grid-cols-1">
          <Card title="Identité &amp; SEO">
            <Field label="Accroche (pied de page)" name="tagline">
              <Input name="tagline" defaultValue={s.tagline} />
            </Field>
            <Field label="Titre SEO par défaut" hint="70 caractères max." name="seo.title">
              <Input name="seo.title" defaultValue={s.seo.title ?? ""} maxLength={70} />
            </Field>
            <Field label="Description SEO par défaut" hint="200 caractères max." name="seo.description">
              <Textarea name="seo.description" defaultValue={s.seo.description ?? ""} maxLength={200} rows={3} className="!min-h-0" />
            </Field>
          </Card>
          <Card title="Réseaux sociaux">
            <Field label="Instagram" name="socials.instagram">
              <Input name="socials.instagram" type="url" defaultValue={s.socials.instagram ?? ""} placeholder="https://instagram.com/…" />
            </Field>
            <Field label="TikTok" name="socials.tiktok">
              <Input name="socials.tiktok" type="url" defaultValue={s.socials.tiktok ?? ""} placeholder="https://tiktok.com/@…" />
            </Field>
            <Field label="Facebook" name="socials.facebook">
              <Input name="socials.facebook" type="url" defaultValue={s.socials.facebook ?? ""} placeholder="https://facebook.com/…" />
            </Field>
          </Card>
          <Card title="Bas de page">
            <Field label="Ligne légale" hint="Affichée à droite du copyright ; vide pour rien." name="legal.footerLine">
              <Input name="legal.footerLine" defaultValue={s.legal.footerLine} />
            </Field>
          </Card>
        </div>
      </ActionForm>

      <Card title="Notifications push" className="mt-3">
        <p className="-mt-1 text-[0.8125rem] leading-relaxed text-subtle">Recevez une notification sur votre téléphone ou votre ordinateur à chaque évènement choisi. À activer sur chaque appareil (idéalement l'admin installé en application).</p>
        <PushSettings />
      </Card>
    </>
  );
}
