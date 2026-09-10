import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/admin/ui";
import { ServiceModeSwitch } from "@/components/admin/ServiceModeSwitch";
import { saveShippingAction } from "@/lib/admin/actions/settings";
import { getSettings } from "@/lib/db/settings";
import { boxtalConfigured, boxtalMapConfigured } from "@/lib/boxtal/client";
import { ShippingRateEditor } from "@/components/admin/ShippingRateEditor";
import { DEFAULT_SHIPPING_RATES } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Livraison : ce que paie le client (tarifs par pays et par poids) et ce qu'il faut à
 * Boxtal pour créer l'étiquette (expéditeur, colis par défaut). Séparée des Paramètres
 * pour rester à côté des commandes ; un seul formulaire, enregistré par l'en-tête.
 */
export default async function ShippingPage() {
  const s = await getSettings();
  const formId = "shipping-form";
  // Les trois transporteurs actifs, dans l'ordre : valeurs enregistrées si présentes, sinon les défauts.
  const rates = DEFAULT_SHIPPING_RATES.map((def) => s.shipping.rates.find((r) => r.id === def.id) ?? def);
  const sender = s.shipping.sender;
  const parcel = s.shipping.parcel;
  const boxtalOn = boxtalConfigured();

  return (
    <>
      <PageHeader
        title="Livraison"
        subtitle="Tarifs proposés au client, expéditeur et colis par défaut."
        actions={
          <Button form={formId} tone="primary">
            Enregistrer
          </Button>
        }
      />
      <ActionForm id={formId} action={saveShippingAction} hideFooter>
        <div className="grid grid-cols-2 items-start gap-3 max-[1099px]:grid-cols-1">
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
            className="[&_input]:bg-deep-soft [&_input]:text-on-deep [&_select]:bg-deep-soft [&_select]:text-on-deep [&_label>span:first-child]:text-on-deep-muted [&_label_span.text-subtle]:text-on-deep-muted"
          >
            <p className="-mt-1 text-xs text-on-deep-muted">Étiquettes, suivi et carte des points relais. Les clés sont dans la configuration du serveur ; ici, l'adresse d'expédition et le colis par défaut.</p>
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
            <div className="grid grid-cols-3 gap-3 border-t border-deep-line pt-3 max-[749px]:grid-cols-2">
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
            <span className="text-[0.6875rem] leading-relaxed text-on-deep-muted">Le poids du colis = emballage + somme des poids des produits (défini sur chaque fiche produit). Le poids par défaut ci-dessus sert de repli. Contenu déclaré : « Livres ».</span>
          </Card>
        </div>
      </ActionForm>
    </>
  );
}
