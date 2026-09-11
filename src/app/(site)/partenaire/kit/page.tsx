import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { KitOrderForm } from "@/components/site/KitOrderForm";
import { Eyebrow } from "@/components/site/ui";
import { orderPartnerKitAction } from "@/lib/auth/partner-actions";
import { requireInfluencer } from "@/lib/auth/session";
import { getMapToken } from "@/lib/boxtal/client";
import { partnerKitSnapshot } from "@/lib/db/partner";
import { getInfluencerByUid } from "@/lib/db/promos";
import { getSettings } from "@/lib/db/settings";
import { shippingOptions } from "@/lib/checkout/quote";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";
import { kitWeightG } from "@/lib/promos/kit";

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
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) notFound();

  const kit = await partnerKitSnapshot(influencer);
  if (!kit.offered || kit.order) redirect("/partenaire#kit");

  const settings = await getSettings();
  const weight = Math.max(1, settings.shipping.parcel.baseWeightG + kitWeightG(kit.items));
  // Port offert : `freeAll` met tous les modes à 0 €, le barème ne sert qu'à l'offre Boxtal.
  const options = shippingOptions(settings.shipping.rates, bracketIndexForWeight(weight), true, true).map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    relay: o.relay,
    networks: o.networks,
  }));
  const mapToken = await getMapToken().catch(() => null);

  return (
    <section className="site-wrap flex flex-col gap-6 py-4 pb-20">
      <div className="flex flex-col gap-2">
        <Eyebrow>Kit de bienvenue</Eyebrow>
        <h1 className="display-1 text-[clamp(1.75rem,3.5vw,2.5rem)]">{kit.title}</h1>
        <Link href="/partenaire" className="w-fit border-b-[1.5px] border-ink text-[0.8125rem] font-bold">
          Retour à mon espace
        </Link>
      </div>

      <div className="grid grid-cols-[1fr_360px] items-start gap-4 max-[899px]:grid-cols-1">
        <KitOrderForm name={influencer.name} countries={settings.shipping.countries} options={options} mapToken={mapToken} action={orderPartnerKitAction} />

        <aside className="flex flex-col gap-3 rounded-card bg-tint-green p-7">
          <span className="text-base font-extrabold">Ce que vous recevez</span>
          {kit.items.map((item) => (
            <div key={item.slug} className="flex items-center gap-3 border-t border-white/60 pt-3 first:border-0 first:pt-0">
              {item.image ? (
                <Image src={item.image.url} alt={item.image.alt || item.title} width={48} height={48} className="h-12 w-12 shrink-0 rounded-thumb bg-white object-cover" />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded-thumb bg-white" />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[0.8125rem] font-bold">{item.title}</span>
                <span className="text-xs text-tint-green-ink">{item.qty > 1 ? `${item.qty} exemplaires` : "1 exemplaire"}</span>
              </span>
            </div>
          ))}
          <span className="border-t border-white/60 pt-3 text-[0.8125rem] font-extrabold">Offert · livraison comprise</span>
          {kit.prototype && <span className="text-xs text-tint-green-ink">Ces exemplaires sont des prototypes : la version définitive peut différer légèrement.</span>}
        </aside>
      </div>
    </section>
  );
}
