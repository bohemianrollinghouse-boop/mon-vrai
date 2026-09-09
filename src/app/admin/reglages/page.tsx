import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea } from "@/components/admin/ui";
import { ServiceModeSwitch } from "@/components/admin/ServiceModeSwitch";
import { saveSettingsAction } from "@/lib/admin/actions/settings";
import { getSettings } from "@/lib/db/settings";
import { boxtalConfigured, boxtalMapConfigured } from "@/lib/boxtal/client";
import { ShippingRateEditor } from "@/components/admin/ShippingRateEditor";
import { DEFAULT_SHIPPING_RATES } from "@/lib/domain/types";
import { stripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

/*
 * Paramètres, d'après la maquette : deux colonnes de cartes — boutique et paiement à
 * gauche, livraison et factures à droite — puis identité/SEO, réseaux et pied de page.
 * Un seul formulaire : le bouton « Enregistrer » de l'en-tête soumet tout.
 */
export default async function SettingsPage() {
  const s = await getSettings();
  const formId = "settings-form";
  // Les trois transporteurs actifs, dans l'ordre : valeurs enregistrées si présentes, sinon les défauts.
  const rates = DEFAULT_SHIPPING_RATES.map((def) => s.shipping.rates.find((r) => r.id === def.id) ?? def);
  const sender = s.shipping.sender;
  const parcel = s.shipping.parcel;
  const boxtalOn = boxtalConfigured();

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle="Boutique, paiement, livraison, factures, identité."
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
            <Card title="Livraison proposée au client">
              <ServiceModeSwitch service="boxtal" mode={s.shipping.boxtalMode} label="Boxtal (étiquettes)" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Offerte à partir de (€)" hint="0 = jamais." name="shipping.freeThresholdEuros">
                  <Input name="shipping.freeThresholdEuros" type="number" step="0.01" min="0" defaultValue={(s.shipping.freeThreshold / 100).toString()} className="!font-bold" />
                </Field>
                <Field label="Pays" hint="Codes à deux lettres, virgules." name="shipping.countries">
                  <Input name="shipping.countries" defaultValue={s.shipping.countries.join(", ")} className="!font-bold" />
                </Field>
              </div>
              <div className="flex flex-col gap-2.5">
                {rates.map((r, i) => (
                  <ShippingRateEditor key={r.id} index={i} rate={r} freeThreshold={s.shipping.freeThreshold} />
                ))}
              </div>
              <span className="text-[0.6875rem] leading-relaxed text-subtle">
                Le prix facturé au client varie selon le poids du colis et le pays de destination (France, Belgique, Luxembourg). Le coût Boxtal affiché est ce que vous payez réellement (TTC, grille officielle) : fixez un prix client au-dessus. L'offre Boxtal (par pays) sert à créer l'étiquette — Chrono 13 en France, Chrono Classic vers la Belgique et le Luxembourg. Une offre « relais » affiche la carte des points relais au client.
              </span>
            </Card>

            <Card
              tone="dark"
              title="Boxtal"
              aside={
                boxtalOn ? (
                  <span className="rounded-pill bg-tint-green-ink px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-green">Connecté{boxtalMapConfigured() ? " · carte" : ""}</span>
                ) : (
                  <span className="rounded-pill bg-tint-sand-ink px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-tint-sand">Clés manquantes</span>
                )
              }
              className="[&_input]:bg-ink-soft [&_input]:text-white [&_select]:bg-ink-soft [&_select]:text-white [&_label>span:first-child]:text-[#bbb] [&_label_span.text-subtle]:text-[#888]"
            >
              <p className="-mt-1 text-xs text-[#bbb]">Étiquettes, suivi et carte des points relais. Les clés sont dans la configuration du serveur ; ici, l'adresse d'expédition et le colis par défaut.</p>
              <div className="grid grid-cols-2 gap-3 max-[749px]:grid-cols-1">
                <Field label="Prénom (expéditeur)" name="shipping.sender.firstName">
                  <Input name="shipping.sender.firstName" defaultValue={sender.firstName} />
                </Field>
                <Field label="Nom" name="shipping.sender.lastName">
                  <Input name="shipping.sender.lastName" defaultValue={sender.lastName} />
                </Field>
                <Field label="Société" hint="Vide : nom de la boutique." name="shipping.sender.company" className="col-span-2 max-[749px]:col-span-1">
                  <Input name="shipping.sender.company" defaultValue={sender.company} />
                </Field>
                <Field label="Rue" name="shipping.sender.street" className="col-span-2 max-[749px]:col-span-1">
                  <Input name="shipping.sender.street" defaultValue={sender.street} />
                </Field>
                <Field label="Code postal" name="shipping.sender.postalCode">
                  <Input name="shipping.sender.postalCode" defaultValue={sender.postalCode} />
                </Field>
                <Field label="Ville" name="shipping.sender.city">
                  <Input name="shipping.sender.city" defaultValue={sender.city} />
                </Field>
                <Field label="Pays" name="shipping.sender.country">
                  <Input name="shipping.sender.country" defaultValue={sender.country} maxLength={2} />
                </Field>
                <Field label="Téléphone portable" hint="Exigé par les transporteurs." name="shipping.sender.phone">
                  <Input name="shipping.sender.phone" defaultValue={sender.phone} />
                </Field>
                <Field label="E-mail" hint="Vide : e-mail de contact." name="shipping.sender.email" className="col-span-2 max-[749px]:col-span-1">
                  <Input name="shipping.sender.email" type="email" defaultValue={sender.email} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-[#333] pt-3 max-[749px]:grid-cols-2">
                <Field label="Longueur (cm)" name="shipping.parcel.lengthCm">
                  <Input name="shipping.parcel.lengthCm" type="number" min={1} defaultValue={parcel.lengthCm} />
                </Field>
                <Field label="Largeur (cm)" name="shipping.parcel.widthCm">
                  <Input name="shipping.parcel.widthCm" type="number" min={1} defaultValue={parcel.widthCm} />
                </Field>
                <Field label="Hauteur (cm)" name="shipping.parcel.heightCm">
                  <Input name="shipping.parcel.heightCm" type="number" min={1} defaultValue={parcel.heightCm} />
                </Field>
                <Field label="Poids par défaut (g)" hint="Repli si un produit n'a pas de poids." name="shipping.parcel.unitWeightG">
                  <Input name="shipping.parcel.unitWeightG" type="number" min={1} defaultValue={parcel.unitWeightG} />
                </Field>
                <Field label="Emballage (g)" name="shipping.parcel.baseWeightG">
                  <Input name="shipping.parcel.baseWeightG" type="number" min={0} defaultValue={parcel.baseWeightG} />
                </Field>
                <Field label="Format d'étiquette" name="shipping.parcel.labelType">
                  <Select name="shipping.parcel.labelType" defaultValue={parcel.labelType}>
                    <option value="PDF_10x15">10 × 15 cm (imprimante d'étiquettes)</option>
                    <option value="PDF_A4">A4</option>
                  </Select>
                </Field>
              </div>
              <input type="hidden" name="shipping.parcel.contentCategoryId" value={parcel.contentCategoryId} />
              <span className="text-[0.6875rem] leading-relaxed text-[#888]">Le poids du colis = emballage + somme des poids des produits (défini sur chaque fiche produit). Le poids par défaut ci-dessus sert de repli. Contenu déclaré : « Livres ».</span>
            </Card>

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
    </>
  );
}
