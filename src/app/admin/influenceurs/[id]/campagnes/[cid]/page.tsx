import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { ContractPicker } from "@/components/admin/ContractPicker";
import { WelcomeKitEditor } from "@/components/admin/WelcomeKitEditor";
import { Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea } from "@/components/admin/ui";
import { CodeInput } from "@/components/admin/CodeInput";
import { SignedContractView } from "@/components/site/SignedContractView";
import { completeCampaignAction, deleteCampaignAction, saveCampaignAction } from "@/lib/admin/actions/campaigns";
import { clockNow, getCampaign, listCampaigns } from "@/lib/db/campaigns";
import { getSignature, listContracts } from "@/lib/db/contracts";
import { findKitOrder } from "@/lib/db/orders";
import { listAllProducts } from "@/lib/db/products";
import { getOperation } from "@/lib/db/operations";
import { getInfluencer } from "@/lib/db/promos";
import { formatEuro } from "@/lib/domain/money";
import { CAMPAIGN_STATUS_LABELS, CollaborationType, COLLABORATION_LABELS } from "@/lib/domain/types";
import { manualPlaceholders } from "@/lib/promos/contract-template";
import { campaignLive, campaignStart } from "@/lib/promos/campaign";

export const dynamic = "force-dynamic";

/*
 * Une campagne, en pleine page.
 *
 * Elle porte tout ce qui se négocie une fois avec un partenaire : le kit offert, le
 * contrat à signer et ses réglages. La fiche du partenaire, elle, ne décrit que la
 * personne — et n'affiche de ses campagnes qu'une vignette, qui mène ici.
 *
 * Ce qui a déjà eu lieu (la commande du kit, le contrat accepté) est montré à droite et
 * ne se modifie pas : la signature garde une copie figée du texte, et rien de ce qu'on
 * change ici ne la réécrit.
 */

const STATUS_TONE = { draft: "neutral", active: "ok", completed: "muted", cancelled: "warn" } as const;

export default async function CampaignPage({ params }: PageProps<"/admin/influenceurs/[id]/campagnes/[cid]">) {
  const { id, cid } = await params;
  const [influencer, campaign] = await Promise.all([getInfluencer(id), getCampaign(cid)]);
  /* Une campagne ne s'ouvre que depuis la fiche de SON partenaire : l'adresse ne suffit pas. */
  if (!influencer || !campaign || campaign.influencerId !== influencer.id) notFound();

  const [products, contracts, order, signature, siblings, operation, at] = await Promise.all([
    listAllProducts(),
    listContracts(),
    findKitOrder(influencer.id, campaign.seq).catch(() => null),
    getSignature(campaign.signatureId).catch(() => null),
    listCampaigns(influencer.id),
    getOperation(campaign.operationId).catch(() => null),
    clockNow(),
  ]);

  /* Un contrat retiré n'est plus proposable, sauf s'il est déjà celui de la campagne. */
  const choices = contracts.filter((c) => c.active || c.id === campaign.contractId);
  const closed = campaign.status === "completed" || campaign.status === "cancelled";
  const waiting = campaign.status === "draft" && siblings.some((c) => c.status === "active" && c.id !== campaign.id);
  const title = campaign.name || `Campagne n° ${campaign.seq}`;
  const day = (ts: number | undefined) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");
  /* Le code peut être porté par plusieurs campagnes : on le dit, pour qu'on ne s'étonne
     pas de le voir survivre à la clôture de celle-ci. */
  const shared = campaign.code ? siblings.filter((c) => c.code === campaign.code && c.id !== campaign.id) : [];
  const live = campaignLive(campaign, at);

  return (
    <>
      <PageHeader
        back={{ href: `/admin/influenceurs/${influencer.id}?onglet=campagnes`, label: `${influencer.name} · campagnes` }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title}
            <Pill tone={STATUS_TONE[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Pill>
          </span>
        }
        subtitle={`Campagne n° ${campaign.seq} · ${COLLABORATION_LABELS[campaign.collaborationType]} · ouverte le ${new Date(campaign.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
      />

      {/*
        Née d'une campagne partagée : on le dit, et on y renvoie. Ce qui suit reste
        modifiable pour ce partenaire seul — la campagne ne redescend pas sur ce qui est
        déjà ouvert, et ce qu'on change ici n'y remonte pas.
      */}
      {operation && (
        <p className="rounded-card bg-paper px-6 py-4 text-[0.8125rem] leading-relaxed text-subtle">
          Participation à la campagne{" "}
          <Link href={`/admin/campagnes/${operation.id}`} className="font-bold text-ink hover:opacity-70">
            {operation.name} →
          </Link>{" "}
          · ce qui est réglé ici ne vaut que pour {influencer.name}.
        </p>
      )}

      {waiting && (
        <p className="rounded-card bg-tint-sand px-6 py-4 text-[0.8125rem] leading-relaxed text-tint-sand-ink">
          Une autre campagne est en cours : celle-ci attend son tour. Marquez la précédente terminée pour que{" "}
          {influencer.name} y ait accès.
        </p>
      )}

      <div className="grid grid-cols-2 items-start gap-3 max-[1199px]:grid-cols-1">
        {/* ---------- Ce qui se règle ---------- */}
        <div className="flex flex-col gap-3">
          <Card title="Ce qui est convenu">
            <ActionForm action={saveCampaignAction} submitLabel="Enregistrer la campagne">
              <input type="hidden" name="id" value={campaign.id} />
              <input type="hidden" name="influencerId" value={influencer.id} />
              <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
                <Field label="Nom de la campagne" hint="Pour s'y retrouver : « Lancement automne »." name="name">
                  <Input name="name" defaultValue={campaign.name} placeholder={`Campagne n° ${campaign.seq}`} />
                </Field>
                <Field label="Collaboration" hint="Détermine le contrat proposé." name="collaborationType">
                  <Select name="collaborationType" defaultValue={campaign.collaborationType}>
                    {CollaborationType.options.map((t) => (
                      <option key={t} value={t}>
                        {COLLABORATION_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* ---------- Quand ---------- */}
              {/*
                Les dates ne sont pas décoratives : le code promo ne vaut qu'entre les
                deux, et le contrat les cite ({{DATE_DEBUT_CAMPAGNE}}, {{DATE_FIN_DE_CAMPAGNE}}).
              */}
              <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
                <Field label="Début de la campagne" name="startAt">
                  <Input name="startAt" type="date" required defaultValue={day(campaignStart(campaign))} />
                </Field>
                <Field label="Fin de la campagne" hint="Passée cette date, le code ne remise plus rien." name="endAt">
                  <Input name="endAt" type="date" required defaultValue={day(campaign.endAt)} />
                </Field>
              </div>

              {/* ---------- Le code promo ---------- */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-subtle">Code promo de la campagne</span>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <CodeInput name="code" initial={campaign.code} placeholder="MARIE10" generate={false} />
                  </div>
                  <span className="flex items-center rounded-xl bg-paper px-3">
                    <input name="discount" type="number" min={0} max={100} defaultValue={campaign.discount} className="w-10 bg-transparent py-3 text-right text-sm font-extrabold outline-none" />
                    <span className="text-[0.8125rem] font-extrabold">%</span>
                  </span>
                </div>
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  Remise offerte à sa communauté. Vide : la campagne ne donne pas de code, seul son lien de suivi
                  attribue les ventes.
                  {shared.length > 0 && ` Ce code est aussi porté par ${shared.length} autre${shared.length > 1 ? "s" : ""} campagne${shared.length > 1 ? "s" : ""} : il continuera de valoir tant que l'une d'elles sera en cours.`}
                </span>
              </div>

              <ContractPicker
                contracts={choices.map((c) => ({
                  id: c.id,
                  label: `${c.name} · ${c.version}`,
                  keys: manualPlaceholders(`${c.summary}\n${c.body}`).sort(),
                  defaults: c.variables,
                }))}
                initialId={campaign.contractId}
                overrides={campaign.contractVariables}
                fieldClassName="w-full rounded-xl border border-line bg-paper px-3 py-3 text-[0.8125rem]"
                labelClassName="text-xs font-semibold text-subtle"
              />

              {/* ---------- Le kit de cette campagne ---------- */}
              <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
                <span className="text-xs font-semibold text-subtle">Kit de bienvenue</span>
                <p className="-mt-1 text-[0.6875rem] leading-relaxed text-subtle">
                  Les livres offerts dans cette campagne. Le partenaire les commande lui-même depuis son espace, en
                  donnant son adresse ou un point relais ; la commande arrive dans « À expédier » et s&apos;expédie par
                  Boxtal comme les autres.
                </p>
                <Switch name="enabled" label="Proposer le kit dans son espace" defaultChecked={campaign.kit.enabled} />
                <Switch
                  name="deductStock"
                  label="Décompter du stock de vente"
                  hint="Par défaut non : le kit vient d'un stock à part réservé aux influenceurs."
                  defaultChecked={campaign.kit.deductStock}
                />
                <Switch
                  name="prototype"
                  label="Ce sont des prototypes"
                  hint="Ajoute une mention discrète dans son espace : les livres reçus ne sont pas les exemplaires définitifs."
                  defaultChecked={campaign.kit.prototype}
                />
                <Field label="Titre de l'encart" name="title">
                  <Input name="title" defaultValue={campaign.kit.title} placeholder="Votre kit de bienvenue" />
                </Field>
                <Field label="Texte" hint="Deux phrases au plus : ce qu'il reçoit et sous quel délai." name="text">
                  <Textarea name="text" defaultValue={campaign.kit.text} placeholder="Trois imagiers à découvrir, à filmer, à offrir. Expédié sous 48 h." />
                </Field>
                <WelcomeKitEditor
                  products={products.map((p) => ({ slug: p.slug, title: p.title, image: p.images[0]?.url, tint: p.tint, stock: p.stock }))}
                  initial={campaign.kit.lines}
                />
              </div>
            </ActionForm>
          </Card>
        </div>

        {/* ---------- Ce qu'elle a produit ---------- */}
        <div className="flex flex-col gap-3">
          <Card title={<span className="text-sm">Kit commandé</span>} className="!gap-2">
            {order ? (
              <>
                <Link href={`/admin/commandes/${order.id}`} className="text-[0.8125rem] font-bold hover:opacity-70">
                  {order.number} · {order.shippingAddress.name} →
                </Link>
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  {order.tracking?.number || order.boxtal?.trackingNumber
                    ? `Suivi ${order.tracking?.number ?? order.boxtal?.trackingNumber} — visible dans son espace.`
                    : "Créez l'étiquette Boxtal depuis la commande, ou saisissez-y un suivi à la main : il apparaîtra dans son espace."}
                </span>
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  Supprimer cette commande rouvre la campagne et annule le contrat, sans l&apos;effacer.
                </span>
              </>
            ) : (
              <span className="text-[0.8125rem] text-subtle">
                Pas encore commandé. {campaign.kit.enabled ? "Le kit est proposé dans son espace." : "Le kit n'est pas encore proposé dans son espace."}
              </span>
            )}
          </Card>

          <Card title={<span className="text-sm">Code promo</span>} className="!gap-2">
            {campaign.code ? (
              <>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-paper px-2.5 py-1.5 text-xs font-bold">{campaign.code}</span>
                  <span className="text-[0.8125rem] font-extrabold">−{campaign.discount} %</span>
                  <Pill tone={live ? "ok" : "muted"}>{live ? "Valable" : "Ne remise plus"}</Pill>
                </span>
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  Du {new Date(campaignStart(campaign)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  {campaign.endAt ? ` au ${new Date(campaign.endAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ", sans fin renseignée"}. Son
                  lien de suivi, lui, continue de compter les visites et d&apos;attribuer les ventes même après la fin.
                </span>
              </>
            ) : (
              <span className="text-[0.8125rem] text-subtle">Aucun code pour cette campagne. Seul le lien de suivi attribue les ventes.</span>
            )}
          </Card>

          <Card title={<span className="text-sm">Contrat</span>} className="!gap-2">
            {signature ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-[0.8125rem] max-[749px]:grid-cols-1">
                  <span className="flex flex-col">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Signé le</span>
                    <span className="font-semibold">{new Date(signature.acceptedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</span>
                    <span className="text-[0.6875rem] text-subtle">version {signature.contractVersion || "—"}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Signataire</span>
                    <span className="font-semibold">{signature.signerTypedName}</span>
                    <span className="text-[0.6875rem] text-subtle">
                      {signature.status === "individual" ? "Particulier" : signature.status === "sole_trader" ? "Micro-entrepreneur" : "Société"}
                      {signature.siret && ` · SIRET ${signature.siret}`}
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Avantage en nature</span>
                    <span className="font-extrabold">{formatEuro(signature.totalValue)}</span>
                    <span className="text-[0.6875rem] text-subtle">{signature.products.map((p) => `${p.title}${p.qty > 1 ? ` × ${p.qty}` : ""}`).join(", ") || "—"}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Empreinte</span>
                    <span className="font-semibold">{signature.contractHash.slice(0, 16)}…</span>
                    <span className="text-[0.6875rem] text-subtle">Référence {signature.id}</span>
                  </span>
                </div>
                <SignedContractView
                  title={signature.contractName}
                  version={signature.contractVersion}
                  acceptedAt={new Date(signature.acceptedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
                  signerName={signature.signerTypedName}
                  reference={signature.id}
                  body={signature.bodySnapshot}
                  label="Lire le contrat signé"
                />
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  Le texte accepté est conservé tel quel : modifier le contrat ou ses réglages n&apos;y change rien.
                </span>
              </>
            ) : campaign.contractId ? (
              <span className="text-[0.8125rem] text-subtle">Pas encore signé : le contrat lui sera présenté au moment de commander son kit.</span>
            ) : (
              <span className="text-[0.8125rem] text-subtle">Aucun contrat exigé. Choisissez-en un à gauche pour qu&apos;il doive le signer avant de recevoir son kit.</span>
            )}
          </Card>

          <Card title={<span className="text-sm">Clore cette campagne</span>} className="!gap-2">
            {closed ? (
              <span className="text-[0.8125rem] text-subtle">
                Campagne {CAMPAIGN_STATUS_LABELS[campaign.status].toLowerCase()}
                {campaign.completedAt && ` le ${new Date(campaign.completedAt).toLocaleDateString("fr-FR")}`}
                {campaign.cancelledAt && ` le ${new Date(campaign.cancelledAt).toLocaleDateString("fr-FR")}`}. Elle reste
                consultable, de son côté comme du vôtre.
              </span>
            ) : (
              <ActionForm
                action={completeCampaignAction}
                submitLabel="Marquer terminée"
                submitTone="outline"
                confirm={`Terminer cette campagne ? Le contrat signé est conservé, et ${influencer.name} n'aura plus de kit à commander tant qu'une nouvelle campagne n'est pas ouverte.`}
                className="!gap-0 [&>div:last-child]:justify-start"
                footerNote={<span className="text-xs text-subtle">Le contrat signé passe « terminé ».</span>}
              >
                <input type="hidden" name="id" value={campaign.id} />
              </ActionForm>
            )}
            {!campaign.kitOrderId && !campaign.signatureId && (
              <ActionForm
                action={deleteCampaignAction}
                submitLabel="Supprimer cette campagne"
                submitTone="ghost"
                confirm="Supprimer cette campagne ? Rien n'en a encore découlé, elle ne laisse pas de trace."
                className="!gap-0 border-t border-line-soft pt-2 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent"
              >
                <input type="hidden" name="id" value={campaign.id} />
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
