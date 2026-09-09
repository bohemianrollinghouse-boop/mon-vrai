import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea } from "@/components/admin/ui";
import { saveSettingsAction } from "@/lib/admin/actions/settings";
import { getSettings } from "@/lib/db/settings";
import { boxtalConfigured, boxtalMapConfigured } from "@/lib/boxtal/client";
import { BOXTAL_OFFERS } from "@/lib/boxtal/offers";
import { formatEuro } from "@/lib/domain/money";
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
  const rates = [...s.shipping.rates];
  while (rates.length < 4) rates.push({ id: "", name: "", description: "", price: 0, freeAboveThreshold: false, enabled: false, boxtalOfferCode: "", relay: false, networks: [] });
  const sender = s.shipping.sender;
  const parcel = s.shipping.parcel;
  const boxtalOn = boxtalConfigured();
  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");

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
                <Switch
                  name="payments.testMode"
                  label={
                    <span className="flex items-center gap-2">
                      Paiements en mode test {s.payments.mode === "test" ? <Pill tone="warn">actif</Pill> : <Pill tone="ok">production</Pill>}
                    </span>
                  }
                  hint="Carte de test 4242 4242 4242 4242, n'importe quelle date future et CVC. Commandes marquées « Test » (hors chiffre d'affaires, envoyées à Tiime avec le drapeau test) ; l'étiquette Boxtal reste à créer à la main."
                  defaultChecked={s.payments.mode === "test"}
                />
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="Offerte à partir de (€)" hint="0 = jamais." name="shipping.freeThresholdEuros">
                  <Input name="shipping.freeThresholdEuros" type="number" step="0.01" min="0" defaultValue={(s.shipping.freeThreshold / 100).toString()} className="!font-bold" />
                </Field>
                <Field label="Pays" hint="Codes à deux lettres, virgules." name="shipping.countries">
                  <Input name="shipping.countries" defaultValue={s.shipping.countries.join(", ")} className="!font-bold" />
                </Field>
              </div>
              <div className="flex flex-col gap-2">
                {rates.map((r, i) => (
                  <div key={r.id || i} className="grid grid-cols-[1fr_96px_auto] items-center gap-3 rounded-[14px] bg-paper px-4 py-3 text-[0.8125rem]">
                    <input type="hidden" name={`shipping.rates[${i}].id`} value={r.id} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <input name={`shipping.rates[${i}].name`} defaultValue={r.name} placeholder={i >= s.shipping.rates.length ? "Nouveau mode (ex. Lettre suivie)" : "Nom"} className="w-full bg-transparent font-bold outline-none placeholder:font-medium placeholder:text-faint" />
                      <input name={`shipping.rates[${i}].description`} defaultValue={r.description} placeholder="Délai, ex. 2 à 3 jours" className="w-full bg-transparent text-xs text-subtle outline-none placeholder:text-faint" />
                      <select name={`shipping.rates[${i}].boxtalOfferCode`} defaultValue={r.boxtalOfferCode} className="w-full cursor-pointer bg-transparent text-xs font-semibold text-tint-green-ink outline-none" aria-label="Offre Boxtal">
                        <option value="">— Sans Boxtal (suivi saisi à la main) —</option>
                        {BOXTAL_OFFERS.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                            {o.relay ? " · relais" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1 font-extrabold">
                      <input name={`shipping.rates[${i}].priceEuros`} defaultValue={r.name ? euros(r.price) : ""} placeholder="0,00" inputMode="decimal" className="w-16 bg-transparent text-right outline-none placeholder:font-medium placeholder:text-faint" />
                      €
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <input type="hidden" name={`shipping.rates[${i}].enabled`} value="false" />
                      <Switch name={`shipping.rates[${i}].enabled`} value="true" label={<span className="sr-only">Proposé</span>} defaultChecked={r.enabled} className="!gap-0" />
                      <label className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-subtle">
                        <input type="hidden" name={`shipping.rates[${i}].freeAboveThreshold`} value="false" />
                        <input type="checkbox" name={`shipping.rates[${i}].freeAboveThreshold`} value="true" defaultChecked={r.freeAboveThreshold} className="h-3.5 w-3.5 accent-ink" />
                        offert dès {s.shipping.freeThreshold ? formatEuro(s.shipping.freeThreshold) : "le seuil"}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <span className="text-[0.6875rem] leading-relaxed text-subtle">
                Les modes activés sont proposés à la caisse ; le prix affiché au client est celui que vous saisissez ici (Boxtal ne fournit pas de cotation par l'API v3). L'offre Boxtal sert à créer l'étiquette ; une offre « relais » affiche la carte des points relais au client. Une ligne sans nom est ignorée.
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
                <Field label="Poids par livre (g)" name="shipping.parcel.unitWeightG">
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
              <span className="text-[0.6875rem] leading-relaxed text-[#888]">Le poids du colis = emballage + poids par livre × nombre de livres. Contenu déclaré : « Livres ».</span>
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
