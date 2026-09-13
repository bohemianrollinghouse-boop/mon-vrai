import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSwitch } from "@/components/admin/AutoSubmitSwitch";
import { CopyButton } from "@/components/admin/CodeInput";
import { CommissionField } from "@/components/admin/CommissionField";
import { Card, Field, FilterPills, Input, PageHeader, Pill, Select, Textarea, Tile } from "@/components/admin/ui";
import {
  deleteInfluencerAction,
  markStatementPaidAction,
  saveInfluencerAction,
  saveInfluencerNoteAction,
  sendInfluencerWelcomeAction,
  toggleInfluencerAction,
} from "@/lib/admin/actions/influencers";
import { createCampaignAction } from "@/lib/admin/actions/campaigns";
import { adminSnapshot } from "@/lib/admin/counts";
import { listCampaigns } from "@/lib/db/campaigns";
import { influencerAccount } from "@/lib/db/influencer-account";
import { listContracts } from "@/lib/db/contracts";
import { getInfluencer, listRefClicksSince } from "@/lib/db/promos";
import { listStatements } from "@/lib/db/statements";
import { formatEuro, formatEuroShort } from "@/lib/domain/money";
import { CAMPAIGN_STATUS_LABELS, COLLABORATION_LABELS, OutreachStatus, OUTREACH_LABELS, type Campaign, type Influencer } from "@/lib/domain/types";
import { campaignStart, liveCampaign } from "@/lib/promos/campaign";
import { mainAccount } from "@/lib/promos/socials";
import { maskIban, monthLabel, statementRows } from "@/lib/promos/statements";
import { influencerStats } from "@/lib/promos/stats";

export const dynamic = "force-dynamic";

/*
 * Fiche d'un partenaire, en pleine page, en deux onglets.
 *
 * « Identité » décrit la PERSONNE — son identité, ses réseaux, son code, ses
 * coordonnées bancaires, ses ventes. « Campagnes » liste ce qu'on a négocié avec elle :
 * chaque campagne n'est ici qu'une vignette, et s'ouvre en pleine page
 * (campagnes/<id>) — c'est là que vivent le kit, le contrat et ses réglages.
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
const shortDate = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export default async function InfluencerPage({ params, searchParams }: PageProps<"/admin/influenceurs/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isNew = id === "nouveau";
  const influencer = isNew ? null : await getInfluencer(id);
  if (!isNew && !influencer) notFound();

  if (!influencer) {
    return (
      <>
        <PageHeader back={{ href: "/admin/influenceurs", label: "Influenceurs" }} title="Nouvel influenceur" subtitle="Un lien de suivi lui est attribué à l'enregistrement ; son code promo viendra de sa première campagne." />
        {/* Le formulaire range ses champs par deux : il lui faut de quoi les poser. */}
        <div className="max-w-[58rem]">
          <Card title="Identité">
            <IdentityForm />
          </Card>
        </div>
      </>
    );
  }

  const tab = sp.onglet === "campagnes" ? "campagnes" : "identite";
  const snap = await adminSnapshot();
  const since = new Date(snap.now - 30 * 86_400_000).toISOString().slice(0, 10);
  const [clicks, stored, account, campaigns, contracts] = await Promise.all([
    listRefClicksSince(since).catch(() => []),
    influencer.commission ? listStatements(influencer.id) : Promise.resolve([]),
    influencerAccount(influencer.uid),
    listCampaigns(influencer.id),
    listContracts(),
  ]);
  const contractName = new Map(contracts.map((c) => [c.id, c.name]));
  /* Son code aujourd'hui : celui de sa campagne en cours. Sans campagne, il n'en a pas. */
  const live = liveCampaign(campaigns);

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
        subtitle={`${main.handle} · ${main.platform} · ${live?.code ? `code ${live.code}` : "sans code en cours"} · inscrit le ${longDate(influencer.createdAt)}`}
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
      {/* Au-dessus des onglets : ils disent qui est cette personne pour la boutique, et
          valent quel que soit l'onglet ouvert. */}
      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile tone="green" label="CA attribué (30 j)" value={formatEuroShort(stats.revenue)} note={`${stats.orders} vente${stats.orders > 1 ? "s" : ""} · ${stats.byCode} code · ${stats.byLink} lien`} />
        <Tile label="Clics sur le lien" value={stats.clicks.toLocaleString("fr-FR")} note={`taux de conversion ${pct(stats.conversion)}`} />
        {influencer.commission ? (
          <Tile tone="sand" label="Commission (30 j)" value={formatEuroShort(stats.commission)} note={`${influencer.rate} % du CA attribué`} />
        ) : (
          <Tile label="Remise client" value={live?.code ? `−${live.discount} %` : "—"} note={live?.code ? `code ${live.code}` : "aucune campagne en cours"} />
        )}
        <Tile label="Dernière connexion" value={account?.lastSignInAt ? longDate(account.lastSignInAt) : "Jamais"} note={influencer.activatedAt ? `espace ouvert le ${longDate(influencer.activatedAt)}` : "espace pas encore ouvert"} />
      </div>

      {/* ---------- Les deux onglets ---------- */}
      {/* Des liens, pas un état de composant : l'onglet ouvert se partage et se recharge. */}
      <FilterPills
        items={[
          { href: `/admin/influenceurs/${influencer.id}`, label: "Identité de l'influenceur", active: tab === "identite" },
          { href: `/admin/influenceurs/${influencer.id}?onglet=campagnes`, label: "Campagnes", count: campaigns.length, active: tab === "campagnes" },
        ]}
      />

      {tab === "identite" ? (
        /*
          Pleine largeur, l'un sous l'autre : les ventes se lisent mieux étalées, et la
          fiche d'identité y gagne de pouvoir ranger ses champs côte à côte plutôt que de
          les empiler dans une demi-colonne.
        */
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
                  <span className={`rounded-pill px-2 py-[3px] text-[0.625rem] font-bold ${via === "code" ? "bg-ink text-on-ink" : "bg-tint-green text-tint-green-ink"}`}>{via === "code" ? `code ${order.promoCodes[0] ?? ""}`.trim() : "lien"}</span>
                  <span className="whitespace-nowrap font-extrabold">{formatEuro(order.totals.total)}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card title="Identité">
            <IdentityForm influencer={influencer} />
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

          {/* Les trois petites cartes, elles, n'ont pas besoin de toute la largeur. */}
          <div className="grid grid-cols-3 items-start gap-3 max-[1199px]:grid-cols-1">
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
      ) : (
        /* ---------- Campagnes ---------- */
        /* Des vignettes, rien de plus : le kit, le contrat et ses réglages tiennent
           dans la page de la campagne, où l'on entre en cliquant. */
        <div className="flex flex-col gap-3">
          <p className="text-[0.8125rem] leading-relaxed text-subtle">
            Une campagne porte un kit et un contrat. Le partenaire ne voit que celle en cours ; les précédentes restent
            consultables de son côté comme du vôtre.
          </p>
          <div className="grid grid-cols-3 items-stretch gap-3 max-[1199px]:grid-cols-2 max-[749px]:grid-cols-1">
            {campaigns.map((campaign) => (
              <CampaignTile key={campaign.id} campaign={campaign} influencerId={influencer.id} contractName={contractName.get(campaign.contractId)} />
            ))}
            <NewCampaignTile influencerId={influencer.id} />
          </div>
        </div>
      )}
    </>
  );
}

/*
 * La vignette d'une campagne : son nom, son état, et de quoi la reconnaître d'un coup
 * d'œil — ce qu'elle offre, sous quel contrat, où elle en est. Tout le détail est
 * derrière le clic.
 */
function CampaignTile({ campaign, influencerId, contractName }: { campaign: Campaign; influencerId: string; contractName?: string }) {
  const books = campaign.kit.lines.reduce((sum, l) => sum + l.qty, 0);
  const done = campaign.signatureId ? "Contrat signé" : campaign.kitOrderId ? "Kit commandé" : campaign.kit.enabled ? "Kit proposé" : "Kit non proposé";

  return (
    <Link
      href={`/admin/influenceurs/${influencerId}/campagnes/${campaign.id}`}
      className="flex flex-col gap-2 rounded-card bg-surface p-6 transition-opacity hover:opacity-70"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[0.9375rem] font-extrabold">{campaign.name || `Campagne n° ${campaign.seq}`}</span>
        <Pill tone={STATUS_TONE[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Pill>
      </div>
      <span className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
        {campaign.code ? (
          <>
            <span className="rounded-lg bg-paper px-2 py-1 text-xs font-bold">{campaign.code}</span>
            <span className="font-extrabold">−{campaign.discount} %</span>
          </>
        ) : (
          <span className="text-muted">Sans code promo</span>
        )}
      </span>
      <span className="truncate text-[0.8125rem] text-muted">
        {COLLABORATION_LABELS[campaign.collaborationType]} · {books > 0 ? `${books} livre${books > 1 ? "s" : ""}` : "aucun livre"} ·{" "}
        {contractName ?? (campaign.contractId ? "contrat retiré" : "sans contrat")}
      </span>
      <span className="mt-auto border-t border-line-soft pt-2 text-[0.6875rem] font-semibold text-subtle">
        {shortDate(campaignStart(campaign))} → {campaign.endAt ? shortDate(campaign.endAt) : "fin à renseigner"} · {done}
      </span>
    </Link>
  );
}

/* Le bloc en pointillés : un « + », et la page de la campagne s'ouvre aussitôt. */
function NewCampaignTile({ influencerId }: { influencerId: string }) {
  return (
    <ActionForm action={createCampaignAction} hideFooter className="!gap-0">
      <input type="hidden" name="influencerId" value={influencerId} />
      <button
        type="submit"
        className="flex h-full min-h-[10rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-transparent p-6 text-center transition-colors hover:border-ink hover:bg-surface/60"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper text-2xl font-light leading-none text-subtle">+</span>
        <span className="text-[0.9375rem] font-extrabold">Une nouvelle campagne</span>
        <span className="text-[0.6875rem] leading-relaxed text-subtle">Un nouveau kit, un nouveau contrat.</span>
      </button>
    </ActionForm>
  );
}

/*
 * Le même formulaire sert à créer et à modifier : un seul endroit où changer un champ.
 *
 * Il occupe toute la largeur de la fiche, d'où des champs par deux plutôt qu'empilés.
 * Le nom garde sa ligne entière : c'est l'intitulé de la fiche, pas un champ parmi
 * d'autres.
 */
function IdentityForm({ influencer }: { influencer?: Influencer }) {
  const inf = influencer ?? null;
  const row = "grid grid-cols-2 items-start gap-3 max-[899px]:grid-cols-1";
  return (
    <ActionForm action={saveInfluencerAction} submitLabel={inf ? "Enregistrer" : "Créer le partenaire"}>
      <input type="hidden" name="id" value={inf?.id ?? ""} />
      <input type="hidden" name="active" value={inf ? (inf.active ? "on" : "") : "on"} />

      <Field label="Nom" name="name">
        <Input name="name" required defaultValue={inf?.name ?? ""} placeholder="Marie Petit-Pas" className="!rounded-xl !py-3 !text-[0.8125rem] !font-bold" />
      </Field>

      <div className={row}>
        <Field label="E-mail" hint="Sert au mot de passe de l'espace partenaire." name="email">
          <Input name="email" type="email" defaultValue={inf?.email ?? ""} placeholder="marie@exemple.fr" className="!rounded-xl !py-3 !text-[0.8125rem]" />
        </Field>
        {/* Le démarchage, en amont de toute campagne : où en est la conversation. */}
        <Field label="Où on en est" hint="Se change aussi d'un geste depuis la liste des influenceurs." name="outreach">
          <Select name="outreach" defaultValue={inf?.outreach ?? "todo"} className="!rounded-xl !py-3 !text-[0.8125rem]">
            {OutreachStatus.options.map((o) => (
              <option key={o} value={o}>
                {OUTREACH_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className={row}>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-subtle">Lien de suivi</span>
          <div className="flex items-center gap-2 rounded-xl bg-paper py-1.5 pl-3.5 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">
              {site}/?ref=
              <input name="slug" defaultValue={inf?.slug ?? ""} placeholder="marie" className="w-[40%] bg-transparent font-extrabold text-ink outline-none placeholder:font-semibold placeholder:text-faint" />
            </span>
          </div>
          <span className="text-[0.6875rem] leading-relaxed text-subtle">
            Cookie d&apos;attribution 30 jours. Le lien pose le code de la campagne en cours ; passée la campagne, il
            continue d&apos;attribuer les ventes et de compter les visites, sans remise.
          </span>
        </div>
        {/*
          Commission facultative : sans elle, l'espace partenaire n'en montre rien et n'y
          fait aucune allusion. Le taux reste saisissable pour qu'on puisse le préparer,
          mais il n'est lu que si la case est cochée. Les dates, elles, appartiennent à
          chaque campagne — une personne n'a pas de date de fin.
        */}
        <CommissionField enabled={inf?.commission ?? false} rate={inf?.rate ?? 10} />
      </div>

      {/*
        Ses comptes : renseignés ici si on les connaît, et modifiables par le partenaire
        lui-même depuis son espace — c'est lui qui les tient à jour. Les campagnes les
        reprennent telles quelles : le contrat les cite sans qu'on ait à les ressaisir.
      */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-subtle">Réseaux sociaux</span>
        <div className="grid grid-cols-3 gap-3 max-[899px]:grid-cols-1">
          {(
            [
              ["ig", "Instagram", inf?.socials.instagram],
              ["tt", "TikTok", inf?.socials.tiktok],
              ["fb", "Facebook", inf?.socials.facebook],
            ] as const
          ).map(([key, label, account]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <span className="text-[0.6875rem] font-semibold text-subtle">{label}</span>
              <Input name={`${key}Handle`} defaultValue={account?.handle ?? ""} placeholder="@pseudo" className="!rounded-xl !py-2.5 !text-xs" />
              <Input name={`${key}Url`} defaultValue={account?.url ?? ""} placeholder="https://…" className="!rounded-xl !py-2.5 !text-xs" />
            </div>
          ))}
        </div>
        <span className="text-[0.6875rem] text-subtle">Le partenaire peut les compléter lui-même depuis son espace.</span>
      </div>
    </ActionForm>
  );
}
