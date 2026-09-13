import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSwitch } from "@/components/admin/AutoSubmitSwitch";
import { CodeInput, CopyButton } from "@/components/admin/CodeInput";
import { CommissionField } from "@/components/admin/CommissionField";
import { WelcomeKitEditor } from "@/components/admin/WelcomeKitEditor";
import { Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea, Tile } from "@/components/admin/ui";
import {
  deleteInfluencerAction,
  markStatementPaidAction,
  saveInfluencerAction,
  saveInfluencerNoteAction,
  sendInfluencerWelcomeAction,
  toggleInfluencerAction,
} from "@/lib/admin/actions/influencers";
import { completeCampaignAction, createCampaignAction, deleteCampaignAction, saveCampaignAction } from "@/lib/admin/actions/campaigns";
import { adminSnapshot } from "@/lib/admin/counts";
import { findKitOrder } from "@/lib/db/orders";
import { listCampaigns } from "@/lib/db/campaigns";
import { influencerAccount } from "@/lib/db/influencer-account";
import { listAllProducts } from "@/lib/db/products";
import { getSignature, listContracts } from "@/lib/db/contracts";
import { getInfluencer, listRefClicksSince } from "@/lib/db/promos";
import { listStatements } from "@/lib/db/statements";
import { formatEuro, formatEuroShort } from "@/lib/domain/money";
import {
  CAMPAIGN_STATUS_LABELS,
  CollaborationType,
  COLLABORATION_LABELS,
  type Campaign,
  type Contract,
  type ContractSignature,
  type Influencer,
  type Order,
  type Product,
} from "@/lib/domain/types";
import { mainAccount } from "@/lib/promos/socials";
import { SignedContractView } from "@/components/site/SignedContractView";
import { ContractPicker } from "@/components/admin/ContractPicker";
import { manualPlaceholders } from "@/lib/promos/contract-template";
import { maskIban, monthLabel, statementRows } from "@/lib/promos/statements";
import { influencerStats } from "@/lib/promos/stats";

export const dynamic = "force-dynamic";

/*
 * Fiche d'un partenaire, en pleine page.
 *
 * Elle décrit la PERSONNE — son identité, ses réseaux, son code, ses coordonnées
 * bancaires — et rien de plus. Ce qui se négocie (le kit, le contrat, les délais) se
 * renouvelle : cela vit dans des CAMPAGNES, un bloc chacune, et un partenaire en a
 * autant qu'on veut dans le temps. Une campagne passée n'est pas écrasée par la
 * suivante : elle reste consultable des deux côtés.
 *
 * `?id=nouveau` n'existe plus : la création a sa propre adresse,
 * /admin/influenceurs/nouveau, avec le seul formulaire d'identité.
 */

const PLATFORM_TONE: Record<string, { bg: string; fg: string }> = {
  Instagram: { bg: "bg-tint-pink", fg: "text-tint-pink-ink" },
  TikTok: { bg: "bg-tint-blue", fg: "text-tint-blue-ink" },
  YouTube: { bg: "bg-tint-sand", fg: "text-tint-sand-ink" },
  Blog: { bg: "bg-tint-green", fg: "text-tint-green-ink" },
  Autre: { bg: "bg-paper", fg: "text-ink" },
};

const STATUS_TONE = { draft: "neutral", active: "ok", completed: "muted", cancelled: "warn" } as const;

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/^https?:\/\//, "");
const longDate = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export default async function InfluencerPage({ params }: PageProps<"/admin/influenceurs/[id]">) {
  const { id } = await params;
  const isNew = id === "nouveau";
  const influencer = isNew ? null : await getInfluencer(id);
  if (!isNew && !influencer) notFound();

  const [products, contracts] = await Promise.all([listAllProducts(), listContracts()]);

  if (!influencer) {
    return (
      <>
        <PageHeader back={{ href: "/admin/influenceurs", label: "Influenceurs" }} title="Nouvel influenceur" subtitle="Un code promo et un lien de suivi lui sont attribués à l'enregistrement." />
        <div className="max-w-[42rem]">
          <Card title="Identité">
            <IdentityForm />
          </Card>
        </div>
      </>
    );
  }

  const snap = await adminSnapshot();
  const since = new Date(snap.now - 30 * 86_400_000).toISOString().slice(0, 10);
  const [clicks, stored, account, campaigns] = await Promise.all([
    listRefClicksSince(since).catch(() => []),
    influencer.commission ? listStatements(influencer.id) : Promise.resolve([]),
    influencerAccount(influencer.uid),
    listCampaigns(influencer.id),
  ]);
  /* Chaque campagne avec ce qu'elle a produit : la commande de son kit et sa signature. */
  const blocks = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      order: await findKitOrder(influencer.id, campaign.seq).catch(() => null),
      signature: await getSignature(campaign.signatureId).catch(() => null),
    })),
  );

  const { rows } = influencerStats([influencer], snap.orders, clicks, snap.now);
  const stats = rows[0];
  const statements = influencer.commission ? statementRows(influencer, snap.orders, stored, snap.now) : [];
  const maxSpark = Math.max(1, ...stats.spark.map((d) => d.code + d.link));
  const main = mainAccount(influencer);
  const tone = PLATFORM_TONE[main.platform] ?? PLATFORM_TONE.Autre;
  const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/influenceurs", label: "Influenceurs" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-sm font-bold ${tone.bg} ${tone.fg}`}>{initials(influencer.name)}</span>
            {influencer.name}
            <Pill tone={influencer.active ? "ok" : "muted"}>{influencer.active ? "Active" : "En pause"}</Pill>
            {!influencer.commission && <Pill tone="muted">Sans commission</Pill>}
          </span>
        }
        subtitle={`${main.handle} · ${main.platform} · code ${influencer.code} · inscrit le ${longDate(influencer.createdAt)}`}
        actions={
          <>
            <CopyButton text={`https://${site}/?ref=${influencer.slug}`} />
            <ActionForm action={toggleInfluencerAction} hideFooter className="!gap-0">
              <input type="hidden" name="id" value={influencer.id} />
              <AutoSubmitSwitch label={influencer.active ? "Mettre en pause" : "Réactiver"} defaultChecked={influencer.active} />
            </ActionForm>
          </>
        }
      />

      {/* ---------- Ses chiffres, 30 jours ---------- */}
      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile tone="green" label="CA attribué (30 j)" value={formatEuroShort(stats.revenue)} note={`${stats.orders} vente${stats.orders > 1 ? "s" : ""} · ${stats.byCode} code · ${stats.byLink} lien`} />
        <Tile label="Clics sur le lien" value={stats.clicks.toLocaleString("fr-FR")} note={`taux de conversion ${pct(stats.conversion)}`} />
        {influencer.commission ? (
          <Tile tone="sand" label="Commission (30 j)" value={formatEuroShort(stats.commission)} note={`${influencer.rate} % du CA attribué`} />
        ) : (
          <Tile label="Remise client" value={`−${influencer.discount} %`} note="offerte à sa communauté" />
        )}
        <Tile label="Dernière connexion" value={account?.lastSignInAt ? longDate(account.lastSignInAt) : "Jamais"} note={influencer.activatedAt ? `espace ouvert le ${longDate(influencer.activatedAt)}` : "espace pas encore ouvert"} />
      </div>

      {/* Deux colonnes égales : à gauche ce qui se passe (ventes, campagnes), à droite
          qui est cette personne — ses coordonnées, son accès, ce qu'on note sur elle. */}
      <div className="grid grid-cols-2 items-start gap-3 max-[1199px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          {/* ---------- Ventes ---------- */}
          <Card title={<span className="text-sm">Ventes attribuées</span>} aside={<span className="text-[0.6875rem] font-semibold text-subtle">14 derniers jours</span>} className="!gap-3">
            <div className="flex h-[90px] items-end gap-1" aria-label="Ventes des 14 derniers jours">
              {stats.spark.map((d) => (
                <span key={d.day} className="flex flex-1 flex-col justify-end gap-px" title={`${d.day} · ${d.code} code · ${d.link} lien`}>
                  <span className="rounded-t bg-tint-green" style={{ height: `${Math.round((d.link / maxSpark) * 84)}px` }} />
                  <span className="rounded-t bg-ink" style={{ height: `${Math.max(d.code + d.link ? 0 : 4, Math.round((d.code / maxSpark) * 84))}px` }} />
                </span>
              ))}
            </div>
            <div className="flex gap-3 text-xs font-semibold text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-ink" /> via code
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-tint-green" /> via lien
              </span>
            </div>
            <div className="flex flex-col border-t border-line-soft">
              {stats.recent.length === 0 && <span className="py-3 text-xs text-subtle">Aucune vente attribuée sur la période.</span>}
              {stats.recent.map(({ order, via }) => (
                <Link key={order.id} href={`/admin/commandes/${order.id}`} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 border-b border-line-soft py-2.5 text-xs hover:opacity-70">
                  <span className="font-bold">{order.number.replace(/^MV-\d{4}-/, "#")}</span>
                  <span className="truncate text-muted">{order.shippingAddress.name}</span>
                  <span className={`rounded-pill px-2 py-[3px] text-[0.625rem] font-bold ${via === "code" ? "bg-ink text-on-ink" : "bg-tint-green text-tint-green-ink"}`}>{via === "code" ? `code ${influencer.code}` : "lien"}</span>
                  <span className="whitespace-nowrap font-extrabold">{formatEuro(order.totals.total)}</span>
                </Link>
              ))}
            </div>
          </Card>

          {/* ---------- Relevés ---------- */}
          {influencer.commission && (
            <Card title="Relevés de commission" aside={<span className="text-[0.6875rem] font-semibold text-subtle">versés le 5 du mois</span>}>
              {statements.length === 0 && <span className="text-[0.8125rem] text-subtle">Aucune vente attribuée pour l'instant.</span>}
              {statements.map((st) => (
                <div key={st.month} className="flex items-center justify-between gap-2 border-t border-line-soft pt-2.5 text-[0.8125rem] first:border-0 first:pt-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold capitalize">{monthLabel(st.month)}</span>
                    <span className="text-[0.6875rem] text-subtle">
                      {st.orders} vente{st.orders > 1 ? "s" : ""} · {formatEuro(st.revenue)}
                      {st.clawbacks.length > 0 && ` · reprise ${formatEuro(st.clawbacks.reduce((a, c) => a + c.amount, 0))}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="whitespace-nowrap font-extrabold">{formatEuro(st.commission)}</span>
                    {st.status === "current" ? (
                      <Pill tone="warn">En cours</Pill>
                    ) : (
                      <ActionForm
                        action={markStatementPaidAction}
                        submitLabel={st.status === "paid" ? "Annuler" : "Marquer versée"}
                        submitTone={st.status === "paid" ? "ghost" : "secondary"}
                        className="!gap-0 [&>div:last-child]:justify-end [&_button]:!px-2 [&_button]:!py-1 [&_button]:!text-[0.6875rem]"
                      >
                        <input type="hidden" name="id" value={influencer.id} />
                        <input type="hidden" name="month" value={st.month} />
                        <input type="hidden" name="undo" value={st.status === "paid" ? "true" : "false"} />
                      </ActionForm>
                    )}
                  </span>
                </div>
              ))}
              <span className="text-[0.6875rem] leading-relaxed text-subtle">
                Les montants sont figés au moment du marquage : un remboursement ultérieur ne réécrit pas un relevé versé.
              </span>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Card title="Identité">
            <IdentityForm influencer={influencer} />
          </Card>

          <Card title={<span className="text-sm">Accès à son espace</span>} className="!gap-2">
            <p className="text-[0.6875rem] leading-relaxed text-subtle">
              {influencer.activatedAt
                ? `Espace actif depuis le ${longDate(influencer.activatedAt)}.`
                : influencer.invitedAt
                  ? `Invitation envoyée le ${longDate(influencer.invitedAt)}, en attente de son mot de passe.`
                  : "Lui envoie un lien personnel pour choisir son mot de passe et ouvrir son espace."}
            </p>
            <ActionForm
              action={sendInfluencerWelcomeAction}
              submitLabel={influencer.activatedAt ? "Renvoyer l'invitation" : "Envoyer l'e-mail de bienvenue"}
              submitTone="outline"
              className="!gap-0 [&>div:last-child]:justify-start"
              confirm={influencer.activatedAt ? "Renvoyer une invitation ? Le partenaire devra choisir un nouveau mot de passe, et l'ancien lien cessera de fonctionner." : undefined}
            >
              <input type="hidden" name="id" value={influencer.id} />
            </ActionForm>
          </Card>

          {/* ---------- Ce que lui ne voit pas ---------- */}
          <Card title={<span className="text-sm">Privé · administrateurs</span>} className="!gap-2">
            <div className="flex flex-col gap-1 text-[0.8125rem]">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Virement</span>
              <span className="font-semibold">{maskIban(influencer.iban) || "Aucun IBAN renseigné"}</span>
              <span className="text-[0.6875rem] text-subtle">Saisi par le partenaire depuis son espace ; jamais affiché en entier ici.</span>
            </div>
            <div className="flex flex-col gap-1 border-t border-line-soft pt-2 text-[0.8125rem]">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Compte</span>
              <span className="font-semibold">
                {influencer.uid ? (account ? `Dernière connexion ${account.lastSignInAt ? longDate(account.lastSignInAt) : "jamais"}` : "Compte introuvable côté authentification") : "Pas encore de compte"}
              </span>
              {influencer.email && <span className="text-[0.6875rem] text-subtle">{influencer.email}</span>}
            </div>
            <ActionForm action={saveInfluencerNoteAction} submitLabel="Enregistrer la note" submitTone="secondary" className="border-t border-line-soft pt-2">
              <input type="hidden" name="id" value={influencer.id} />
              <Field label="Note interne" hint="Visible des seuls administrateurs. Jamais montrée au partenaire." name="note">
                <Textarea name="note" defaultValue={influencer.note} placeholder="Contacté en mars, préfère les stories. Envoi du tome 4 promis." />
              </Field>
            </ActionForm>
          </Card>

          <Card title={<span className="text-sm">Zone dangereuse</span>} className="!gap-2">
            <ActionForm
              action={deleteInfluencerAction}
              submitLabel="Supprimer ce partenaire"
              submitTone="ghost"
              confirm={`Supprimer ${influencer.name} ? Son code et son lien cesseront de fonctionner ; les ventes passées restent attribuées.`}
              className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent"
            >
              <input type="hidden" name="id" value={influencer.id} />
            </ActionForm>
          </Card>
        </div>
      </div>

      {/* ---------- Campagnes ---------- */}
      {/*
        Un bloc par campagne, la plus récente d'abord, et un bloc en pointillés pour en
        ouvrir une nouvelle. Pleine largeur : chaque bloc porte le kit, le contrat et
        tous ses réglages — c'est le gros du travail de la fiche.
      */}
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold tracking-[-0.01em]">Campagnes</h2>
          <span className="text-[0.6875rem] font-semibold text-subtle">
            {campaigns.length === 0 ? "Aucune campagne" : `${campaigns.length} campagne${campaigns.length > 1 ? "s" : ""}`} · le partenaire ne voit que
            celle en cours
          </span>
        </div>

        <div className="grid grid-cols-2 items-start gap-3 max-[1199px]:grid-cols-1">
          {blocks.map((block) => (
            <CampaignBlock
              key={block.campaign.id}
              {...block}
              influencer={influencer}
              contracts={contracts}
              products={products}
              /* Une campagne en cours garde la main : le partenaire n'en voit qu'une. */
              waiting={block.campaign.status === "draft" && campaigns.some((c) => c.status === "active")}
            />
          ))}
          <NewCampaignBlock influencerId={influencer.id} />
        </div>
      </div>
    </>
  );
}

/*
 * Le bloc d'une campagne : ce qu'on offre, ce qu'il signe, et ce que ça a donné.
 *
 * Le formulaire d'enregistrement et les boutons d'état sont FRÈRES et non imbriqués :
 * deux <form> l'un dans l'autre ne sont pas permis.
 */
function CampaignBlock({
  campaign,
  order,
  signature,
  influencer,
  contracts,
  products,
  waiting,
}: {
  campaign: Campaign;
  order: Order | null;
  signature: ContractSignature | null;
  influencer: Influencer;
  contracts: Contract[];
  products: Product[];
  /** Ouverte, mais une autre campagne est en cours : le partenaire ne la voit pas encore. */
  waiting: boolean;
}) {
  /* Un contrat retiré n'est plus proposable, sauf s'il est déjà celui de la campagne. */
  const choices = contracts.filter((c) => c.active || c.id === campaign.contractId);
  const closed = campaign.status === "completed" || campaign.status === "cancelled";

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{campaign.name || `Campagne n° ${campaign.seq}`}</span>
          <Pill tone={STATUS_TONE[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Pill>
        </span>
      }
      aside={<span className="text-[0.6875rem] font-semibold text-subtle">n° {campaign.seq} · {COLLABORATION_LABELS[campaign.collaborationType]}</span>}
    >
      {/* ---------- Ce qu'elle a produit ---------- */}
      {order && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-paper px-4 py-3">
          <Link href={`/admin/commandes/${order.id}`} className="text-[0.8125rem] font-bold hover:opacity-70">
            Kit commandé · {order.number} →
          </Link>
          <span className="text-[0.6875rem] leading-relaxed text-subtle">
            {order.tracking?.number || order.boxtal?.trackingNumber
              ? `Suivi ${order.tracking?.number ?? order.boxtal?.trackingNumber} — visible dans son espace.`
              : "Créez l'étiquette Boxtal depuis la commande, ou saisissez-y un suivi à la main : il apparaîtra dans son espace."}
          </span>
        </div>
      )}

      {signature && (
        <div className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3">
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
            Le texte accepté est conservé tel quel : modifier le contrat ou ses réglages ci-dessous n'y change rien.
          </span>
        </div>
      )}

      {!signature && campaign.contractId && (
        <p className="text-[0.8125rem] text-subtle">Contrat pas encore signé : il lui sera présenté au moment de commander son kit.</p>
      )}

      {waiting && (
        <p className="rounded-xl bg-tint-sand px-4 py-3 text-[0.8125rem] leading-relaxed text-tint-sand-ink">
          Une autre campagne est en cours : celle-ci attend son tour. Marquez la précédente terminée pour que
          {" "}{influencer.name} y ait accès.
        </p>
      )}

      {/* ---------- Ce qui se règle ---------- */}
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
            Les livres offerts dans cette campagne. Le partenaire les commande lui-même depuis son espace, en donnant son
            adresse ou un point relais ; la commande arrive dans « À expédier » et s'expédie par Boxtal comme les autres.
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

      {/* ---------- Clore, ou effacer ---------- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        {!closed && (
          <ActionForm
            action={completeCampaignAction}
            submitLabel="Marquer terminée"
            submitTone="outline"
            confirm={`Terminer cette campagne ? Le contrat signé est conservé, et ${influencer.name} n'aura plus de kit à commander tant qu'une nouvelle campagne n'est pas ouverte.`}
            className="!gap-0 [&>div:last-child]:justify-start"
          >
            <input type="hidden" name="id" value={campaign.id} />
          </ActionForm>
        )}
        {!campaign.kitOrderId && !campaign.signatureId && (
          <ActionForm
            action={deleteCampaignAction}
            submitLabel="Supprimer"
            submitTone="ghost"
            confirm="Supprimer cette campagne ? Rien n'en a encore découlé, elle ne laisse pas de trace."
            className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent"
          >
            <input type="hidden" name="id" value={campaign.id} />
          </ActionForm>
        )}
      </div>
    </Card>
  );
}

/* Le bloc en pointillés : un « + », et une campagne de plus. */
function NewCampaignBlock({ influencerId }: { influencerId: string }) {
  return (
    <ActionForm action={createCampaignAction} hideFooter id={`new-campaign-${influencerId}`} className="!gap-0">
      <input type="hidden" name="influencerId" value={influencerId} />
      <button
        type="submit"
        className="flex min-h-[13rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-transparent p-8 text-center transition-colors hover:border-ink hover:bg-surface/60"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper text-2xl font-light leading-none text-subtle">+</span>
        <span className="text-[0.9375rem] font-extrabold">Une nouvelle campagne</span>
        <span className="max-w-[22rem] text-[0.6875rem] leading-relaxed text-subtle">
          Un nouveau kit, un nouveau contrat. La précédente reste consultable, de son côté comme du vôtre.
        </span>
      </button>
    </ActionForm>
  );
}

/* Le même formulaire sert à créer et à modifier : un seul endroit où changer un champ. */
function IdentityForm({ influencer }: { influencer?: Influencer }) {
  const inf = influencer ?? null;
  return (
    <ActionForm action={saveInfluencerAction} submitLabel={inf ? "Enregistrer" : "Créer le partenaire"}>
      <input type="hidden" name="id" value={inf?.id ?? ""} />
      <input type="hidden" name="active" value={inf ? (inf.active ? "on" : "") : "on"} />
      <Field label="Nom" name="name">
        <Input name="name" required defaultValue={inf?.name ?? ""} placeholder="Marie Petit-Pas" className="!rounded-xl !py-3 !text-[0.8125rem] !font-bold" />
      </Field>
      <Field label="E-mail" hint="Sert au mot de passe de l'espace partenaire." name="email">
        <Input name="email" type="email" defaultValue={inf?.email ?? ""} placeholder="marie@exemple.fr" className="!rounded-xl !py-3 !text-[0.8125rem]" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-subtle">Code promo</span>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CodeInput name="code" initial={inf?.code ?? ""} placeholder="MARIE10" generate={false} />
          </div>
          <span className="flex items-center rounded-xl bg-paper px-3">
            <input name="discount" type="number" min={0} max={100} defaultValue={inf?.discount ?? 10} className="w-10 bg-transparent py-3 text-right text-sm font-extrabold outline-none" />
            <span className="text-[0.8125rem] font-extrabold">%</span>
          </span>
        </div>
        <span className="text-[0.6875rem] text-subtle">Remise offerte au client. Le code est attribué à ce partenaire.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-subtle">Lien de suivi</span>
        <div className="flex items-center gap-2 rounded-xl bg-paper py-1.5 pl-3.5 pr-1.5">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">
            {site}/?ref=
            <input name="slug" defaultValue={inf?.slug ?? ""} placeholder="marie" className="w-[40%] bg-transparent font-extrabold text-ink outline-none placeholder:font-semibold placeholder:text-faint" />
          </span>
        </div>
        <span className="text-[0.6875rem] text-subtle">Cookie d'attribution 30 jours. La remise du code s'applique automatiquement au panier via le lien.</span>
      </div>
      {/*
        Ses comptes : renseignés ici si on les connaît, et modifiables par le partenaire
        lui-même depuis son espace — c'est lui qui les tient à jour. Les campagnes les
        reprennent telles quelles : le contrat les cite sans qu'on ait à les ressaisir.
      */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-subtle">Réseaux sociaux</span>
        {(
          [
            ["ig", "Instagram", inf?.socials.instagram],
            ["tt", "TikTok", inf?.socials.tiktok],
            ["fb", "Facebook", inf?.socials.facebook],
          ] as const
        ).map(([key, label, account]) => (
          <div key={key} className="grid grid-cols-[90px_1fr] items-center gap-2">
            <span className="text-[0.6875rem] font-semibold text-subtle">{label}</span>
            <div className="grid grid-cols-2 gap-2">
              <Input name={`${key}Handle`} defaultValue={account?.handle ?? ""} placeholder="@pseudo" className="!rounded-xl !py-2.5 !text-xs" />
              <Input name={`${key}Url`} defaultValue={account?.url ?? ""} placeholder="https://…" className="!rounded-xl !py-2.5 !text-xs" />
            </div>
          </div>
        ))}
        <span className="text-[0.6875rem] text-subtle">Le partenaire peut les compléter lui-même depuis son espace.</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {/*
          Commission facultative : sans elle, l'espace partenaire n'en montre rien et
          n'y fait aucune allusion. Le taux reste saisissable pour qu'on puisse le
          préparer, mais il n'est lu que si la case est cochée.
        */}
        <CommissionField enabled={inf?.commission ?? false} rate={inf?.rate ?? 10} />
        <Field label="Fin de campagne" hint="Vide : sans fin." name="endAt">
          <Input name="endAt" type="date" defaultValue={inf?.endAt ? new Date(inf.endAt).toISOString().slice(0, 10) : ""} className="!rounded-xl !py-3 !text-[0.8125rem]" />
        </Field>
      </div>
    </ActionForm>
  );
}
