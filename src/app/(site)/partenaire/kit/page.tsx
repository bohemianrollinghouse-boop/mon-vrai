import Link from "next/link";
import { redirect } from "next/navigation";
import { KitOrderForm } from "@/components/site/KitOrderForm";
import { Eyebrow } from "@/components/site/ui";
import { orderPartnerKitAction, signAndOrderKitAction } from "@/lib/auth/partner-actions";
import { requireInfluencer } from "@/lib/auth/session";
import { getMapToken } from "@/lib/boxtal/client";
import { partnerKitSnapshot } from "@/lib/db/partner";
import { currentCampaign } from "@/lib/db/campaigns";
import { getInfluencer, getInfluencerByUid } from "@/lib/db/promos";
import { getSettings } from "@/lib/db/settings";
import { shippingOptions } from "@/lib/checkout/quote";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";
import { kitWeightG } from "@/lib/promos/kit";
import { getContract } from "@/lib/db/contracts";
import { COLLABORATION_LABELS } from "@/lib/domain/types";

import type { ContractOffer } from "@/components/site/KitOrderForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commander mon kit" };

/*
 * Bon de commande du kit de bienvenue. Une seule étape : où livrer. Le kit lui-même
 * n'est pas modifiable — les livres ont été choisis en amont — et rien n'est à payer,
 * d'où l'absence de panier et de Stripe. Un partenaire qui a déjà commandé est renvoyé
 * vers son espace, où le suivi a pris la place du bon de commande.
 */
export default async function PartnerKitPage() {
  const user = await requireInfluencer();
  /*
   * Le jeton peut dire « partenaire » alors que la fiche n'existe plus : les rôles sont
   * gravés dans la session à la connexion, et une fiche supprimée ne les réécrit pas.
   * On renvoie donc au compte, plutôt que d'afficher une page introuvable.
   */
  /* En vue « en tant que », le partenaire visé vient du cookie et non du compte. */
  const influencer = user.viewingAs ? await getInfluencer(user.influencerId) : await getInfluencerByUid(user.uid);
  if (!influencer) redirect("/compte");

  const campaign = await currentCampaign(influencer.id);
  const kit = await partnerKitSnapshot(influencer, campaign);
  if (!kit.offered || kit.order) redirect("/partenaire#kit");
  // Sans réseau renseigné, la demande n'a pas de sens : on renvoie à l'encart qui le demande.
  if (kit.socialsMissing) redirect("/partenaire#reseaux");

  const settings = await getSettings();
  const weight = Math.max(1, settings.shipping.parcel.baseWeightG + kitWeightG(kit.items));
  /*
   * Port offert : `freeAll` met tous les modes à 0 €, le barème ne sert qu'à l'offre Boxtal.
   *
   * Et seulement en point relais : un kit part vers quelqu'un qu'on ne connaît pas encore,
   * souvent absent la journée ; le relais évite l'avis de passage et la réexpédition, et
   * revient moins cher sur un envoi qu'on offre. Le filtre est redit côté serveur, à la
   * création de la commande — un formulaire ne décide de rien.
   */
  const options = shippingOptions(settings.shipping.rates, bracketIndexForWeight(weight), true, true)
    .filter((o) => o.relay)
    .map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      relay: o.relay,
      networks: o.networks,
    }));
  const mapToken = await getMapToken().catch(() => null);
  /* Aucun mode relais actif dans les réglages : mieux vaut le dire que d'afficher un
     bon de commande sans livraison possible. */
  const noRelay = options.length === 0;

  /*
   * Le contrat n'est demandé qu'une fois : un partenaire qui a déjà signé commande
   * directement. Le contenu envoyé au navigateur est celui du contrat en base, tel
   * qu'il sera figé dans la signature.
   */
  const contract = !campaign || campaign.signatureId ? null : await getContract(campaign.contractId);
  const view: ContractOffer | undefined = contract
    ? {
        id: contract.id,
        name: contract.name,
        version: contract.version,
        typeLabel: COLLABORATION_LABELS[contract.type],
        summary: contract.summary,
        body: contract.body,
        /* Les réglages de la campagne recouvrent ceux du contrat : un délai ajusté pour
           elle l'emporte, le reste continue de suivre le contrat. */
        variables: { ...contract.variables, ...campaign!.contractVariables },
        requiredVariables: contract.requiredVariables,
        campaign: { startAt: campaign!.startAt ?? campaign!.createdAt, endAt: campaign!.endAt },
      }
    : undefined;

  /* Identité du vendeur, telle qu'elle figure au contrat : elle vient des réglages. */
  const seller = {
    address: [settings.legal.sellerName, ...settings.legal.sellerAddressLines].filter(Boolean).join(", "),
    siren: settings.legal.siret || settings.legal.vatNumber,
    representative: settings.legal.sellerName,
  };

  return (
    <section className="site-wrap flex flex-col gap-6 py-4 pb-20">
      {/* Le geste en titre, le nom du kit au-dessus : on vient ici pour commander. */}
      <div className="flex flex-col gap-2">
        <Eyebrow>{kit.title}</Eyebrow>
        <h1 className="display-1 text-[clamp(1.75rem,3.5vw,2.5rem)]">Commander mon kit</h1>
        {kit.text && <p className="max-w-[44rem] text-sm leading-relaxed text-subtle">{kit.text}</p>}
        <Link href="/partenaire" className="w-fit border-b-[1.5px] border-ink text-[0.8125rem] font-bold">
          Retour à mon espace
        </Link>
      </div>

      {noRelay && (
        <p className="rounded-card bg-tint-sand px-7 py-5 text-sm leading-relaxed text-tint-sand-ink">
          Aucun point relais n&apos;est disponible pour le moment. Écrivez-nous et nous organiserons l&apos;envoi
          autrement.
        </p>
      )}

      <KitOrderForm
        countries={settings.shipping.countries}
        options={options}
        mapToken={mapToken}
        action={orderPartnerKitAction}
        contract={view}
        signAction={view ? signAndOrderKitAction : undefined}
        seller={seller}
        goods={kit.items.map((i) => ({ title: i.title, qty: i.qty, unitValue: i.unitValue }))}
        items={kit.items.map((i) => ({ slug: i.slug, title: i.title, qty: i.qty, image: i.image?.url }))}
        socials={influencer.socials}
        email={influencer.email}
        prototype={kit.prototype}
      />
    </section>
  );
}
