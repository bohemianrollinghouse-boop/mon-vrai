import type Stripe from "stripe";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, GridTable, Input, PageHeader, Pill, Select } from "@/components/admin/ui";
import { createPromoAction, togglePromoAction } from "@/lib/admin/actions/promos";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import { getStripe } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

/*
 * Campagnes de codes promo. La source de vérité est Stripe (coupons + promotion codes)
 * dans le mode de paiement courant ; la caisse applique la remise avant paiement.
 */
export default async function PromosPage() {
  const settings = await getSettings();
  const mode = settings.payments.mode;
  const stripe = getStripe(mode);
  let promos: Stripe.PromotionCode[] = [];
  let error: string | null = null;
  if (!stripe) error = `Stripe (${mode}) n'est pas configuré.`;
  else {
    try {
      promos = (await stripe.promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] })).data;
    } catch (e) {
      error = `Stripe : ${(e as Error).message}`;
    }
  }
  promos.sort((a, b) => Number(b.active) - Number(a.active) || b.created - a.created);
  const nowSec = await currentEpochSeconds();
  const today = new Date(nowSec * 1000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Codes promo" subtitle={`Remises appliquées à la caisse · ${mode === "test" ? "mode test — les codes de production sont distincts" : "production"}.`} />

      <div className="grid grid-cols-[1fr_360px] items-start gap-3 max-[1099px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          {error && <p className="rounded-card bg-danger-bg p-5 text-sm font-semibold text-danger">{error}</p>}
          <GridTable
            columns="140px 1fr 110px 110px 110px 120px"
            head={["Code", "Remise", "Minimum", "Utilisé", "Expire", "Statut"]}
            empty="Aucun code pour l'instant. Créez le premier à droite."
            rows={promos.map((p) => {
              const coupon = p.promotion?.type === "coupon" && typeof p.promotion.coupon === "object" ? p.promotion.coupon : null;
              const discount = coupon?.percent_off ? `−${coupon.percent_off} %` : coupon?.amount_off ? `−${formatEuro(coupon.amount_off)}` : "—";
              const minimum = p.restrictions?.minimum_amount ? formatEuro(p.restrictions.minimum_amount) : "—";
              const expired = (p.expires_at && p.expires_at < nowSec) || coupon?.valid === false;
              const used = `${p.times_redeemed}${p.max_redemptions ? ` / ${p.max_redemptions}` : ""}`;
              return {
                key: p.id,
                cells: [
                  <span key="c" className="font-bold tracking-wide">{p.code}</span>,
                  <span key="d" className="flex flex-col">
                    <span className="font-semibold">{discount}</span>
                    {coupon?.name && coupon.name !== p.code && <span className="truncate text-xs text-subtle">{coupon.name}</span>}
                  </span>,
                  <span key="m" className="text-muted">{minimum}</span>,
                  <span key="u" className="text-muted">{used}</span>,
                  <span key="e" className="text-muted">{p.expires_at ? new Date(p.expires_at * 1000).toLocaleDateString("fr-FR") : "jamais"}</span>,
                  <span key="s" className="flex items-center justify-end gap-2">
                    <Pill tone={p.active && !expired ? "ok" : "muted"}>{expired ? "Expiré" : p.active ? "Actif" : "Inactif"}</Pill>
                    {!expired && (
                      <ActionForm action={togglePromoAction} submitLabel={p.active ? "Désactiver" : "Activer"} submitTone="secondary" className="!gap-0 [&>div:last-child]:contents [&_button]:!px-2.5 [&_button]:!py-1.5 [&_button]:text-[0.6875rem]">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                      </ActionForm>
                    )}
                  </span>,
                ],
              };
            })}
          />
          <p className="px-2 text-xs text-subtle">Le client saisit le code dans le panier ou à la caisse ; la remise s'applique au sous-total, une seule fois par commande. Un code désactivé cesse de fonctionner immédiatement.</p>
        </div>

        <Card title="Nouvelle campagne">
          <ActionForm action={createPromoAction} submitLabel="Créer le code">
            <Field label="Code" hint="Ce que le client tapera, ex. NOEL10. Mis en majuscules." name="code">
              <Input name="code" required maxLength={20} placeholder="NOEL10" className="!font-bold uppercase" />
            </Field>
            <Field label="Nom interne" hint="Facultatif, pour vous y retrouver." name="name">
              <Input name="name" maxLength={60} placeholder="Campagne de Noël" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" name="kind">
                <Select name="kind" defaultValue="percent">
                  <option value="percent">Pourcentage</option>
                  <option value="amount">Montant (€)</option>
                </Select>
              </Field>
              <Field label="Valeur" hint="10 = 10 % ou 10 €." name="value">
                <Input name="value" required inputMode="decimal" placeholder="10" className="!font-bold" />
              </Field>
            </div>
            <Field label="Panier minimum (€)" hint="Vide : aucun minimum." name="minimumEuros">
              <Input name="minimumEuros" inputMode="decimal" placeholder="30" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expire le" hint="Vide : sans limite." name="expiresAt">
                <Input name="expiresAt" type="date" min={today} />
              </Field>
              <Field label="Utilisations max" hint="Vide : illimité." name="maxRedemptions">
                <Input name="maxRedemptions" type="number" min={1} placeholder="100" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

/** L'heure courante, lue hors du rendu (règle de pureté des composants) : la page est dynamique. */
async function currentEpochSeconds(): Promise<number> {
  return Math.floor(Date.now() / 1000);
}
