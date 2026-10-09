import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmitSelect";
import { ButtonLink, Card, FilterPills, GridTable, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { savePartnerWelcomeAction, setInfluencerOutreachAction } from "@/lib/admin/actions/influencers";
import { viewAsPartnerAction } from "@/lib/admin/actions/view-as";
import { PartnerWelcomeEditor } from "@/components/admin/PartnerWelcomeEditor";
import { getAllTemplateValues } from "@/lib/db/newsletter";
import { getSettings } from "@/lib/db/settings";
import { brandFromSettings } from "@/lib/email/newsletter";
import { PARTNER_WELCOME_ID } from "@/lib/newsletter/render";
import { adminSnapshot } from "@/lib/admin/counts";
import { listInfluencers, listRefClicksSince } from "@/lib/db/promos";
import { listAllCampaigns } from "@/lib/db/campaigns";
import { listContracts } from "@/lib/db/contracts";
import { listAllDeliverables } from "@/lib/db/deliverables";
import { contentDues } from "@/lib/admin/content-dues";
import { progressLabel, shortfallLabel } from "@/lib/domain/deliverables";
import { liveCampaign } from "@/lib/promos/campaign";
import { formatEuroShort } from "@/lib/domain/money";
import { influencerStats } from "@/lib/promos/stats";
import { mainAccount } from "@/lib/promos/socials";
import { CAMPAIGN_STATUS_LABELS, OutreachStatus, OUTREACH_LABELS, type Influencer, type PartnerSocials } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Influenceurs, en deux onglets.
 *
 * « Résultats » regarde ce que les partenaires rapportent : les quatre chiffres sur 30
 * jours, puis le tableau des ventes attribuées. « Liste » regarde l'amont — qui on a
 * repéré, qui on a écrit, qui a répondu : les noms, les réseaux, l'adresse et l'état de
 * la conversation, qui se change d'un geste sans quitter la page.
 *
 * Tout ce qui concerne UN partenaire — sa fiche, ses campagnes, ses relevés — vit sur sa
 * propre page, /admin/influenceurs/<id>.
 */

/** Ses comptes, dans l'ordre où on les regarde, et seulement ceux qui existent. */
const socialLinks = (socials: PartnerSocials): { label: string; handle: string; url: string }[] =>
  (
    [
      ["Instagram", socials.instagram],
      ["TikTok", socials.tiktok],
      ["Facebook", socials.facebook],
    ] as const
  )
    .filter(([, a]) => a.handle || a.url)
    .map(([label, a]) => ({ label, handle: a.handle || a.url, url: a.url }));

const PLATFORM_TONE: Record<string, { bg: string; fg: string }> = {
  Instagram: { bg: "bg-tint-pink", fg: "text-tint-pink-ink" },
  TikTok: { bg: "bg-tint-blue", fg: "text-tint-blue-ink" },
  YouTube: { bg: "bg-tint-sand", fg: "text-tint-sand-ink" },
  Blog: { bg: "bg-tint-green", fg: "text-tint-green-ink" },
  Autre: { bg: "bg-paper", fg: "text-ink" },
};

export default async function InfluencersPage({ searchParams }: PageProps<"/admin/influenceurs">) {
  const sp = await searchParams;
  const tab = sp.onglet === "liste" ? "liste" : sp.onglet === "contenus" ? "contenus" : "resultats";
  const [influencers, snap, templateValues, settings, campaigns, contracts, deliverables] = await Promise.all([
    listInfluencers(),
    adminSnapshot(),
    getAllTemplateValues(),
    getSettings(),
    listAllCampaigns(),
    listContracts(),
    listAllDeliverables(),
  ]);
  /* Ce que chacun doit encore : lu ici une fois, pour l'onglet comme pour son compteur. */
  const dues = contentDues({ campaigns, contracts, influencers, deliverables });
  /* Le code d'un partenaire est celui de sa campagne en cours : il change avec elle, et
     s'éteint quand elle se termine. Une seule lecture pour toute la liste. */
  const byInfluencer = new Map<string, ReturnType<typeof liveCampaign>>();
  for (const inf of influencers) {
    byInfluencer.set(inf.id, liveCampaign(campaigns.filter((c) => c.influencerId === inf.id).sort((a, b) => b.seq - a.seq)));
  }
  const since = new Date(snap.now - 30 * 86_400_000).toISOString().slice(0, 10);
  const clicks = await listRefClicksSince(since).catch(() => []);
  const { rows, totals } = influencerStats(influencers, snap.orders, clicks, snap.now);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  return (
    <>
      <PageHeader
        title="Influenceurs"
        subtitle="Une vente est attribuée si le code est utilisé OU si le lien a été cliqué dans les 30 jours"
        actions={
          <>
            <ButtonLink href="/admin/influenceurs/export" tone="secondary">
              Exporter CSV
            </ButtonLink>
            <ButtonLink href="/admin/influenceurs/nouveau" tone="primary">
              + Nouvel influenceur
            </ButtonLink>
          </>
        }
      />

      <FilterPills
        items={[
          { href: "/admin/influenceurs", label: "Résultats", active: tab === "resultats" },
          { href: "/admin/influenceurs?onglet=liste", label: "Liste des influenceurs", count: influencers.length, active: tab === "liste" },
          { href: "/admin/influenceurs?onglet=contenus", label: "Contenus dus", count: dues.totals.late, active: tab === "contenus" },
        ]}
      />

      {tab === "liste" ? (
        <OutreachList influencers={influencers} />
      ) : tab === "contenus" ? (
        <ContentDuesList dues={dues} />
      ) : (
        <>
      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile tone="green" label="CA attribué (30 j)" value={formatEuroShort(totals.revenue)} note={`${pct(totals.share)} du CA total`} />
        <Tile label="Ventes attribuées" value={totals.orders} note={`${totals.byCode} via code · ${totals.byLink} via lien`} />
        <Tile label="Clics sur les liens" value={totals.clicks.toLocaleString("fr-FR")} note={`taux de conversion ${pct(totals.conversion)}`} />
        <Tile tone="sand" label="Commissions dues" value={formatEuroShort(totals.commission)} note="à régler en fin de mois" />
      </div>

      <GridTable
        columns="1fr 130px 70px 90px 100px 90px 90px"
        head={["Influenceur", "Code", "Clics", "Ventes", "CA", "Commission", "Statut"]}
        empty="Aucun influenceur. Ajoutez le premier avec « Nouvel influenceur » : son code viendra de sa première campagne."
        rows={rows.map((r) => {
          const account = mainAccount(r.influencer);
          const tone = PLATFORM_TONE[account.platform] ?? PLATFORM_TONE.Autre;
          return {
            key: r.influencer.id,
            href: `/admin/influenceurs/${r.influencer.id}`,
            cells: [
              <span key="n" className="flex items-center gap-2.5">
                <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill text-xs font-bold ${tone.bg} ${tone.fg}`}>{initials(r.influencer.name)}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-bold">{r.influencer.name}</span>
                  <span className="truncate text-[0.6875rem] text-subtle">
                    {account.handle} · {account.platform}
                  </span>
                </span>
              </span>,
              (() => {
                const live = byInfluencer.get(r.influencer.id);
                return live?.code ? (
                  <span key="c" className="flex w-fit flex-col gap-0.5">
                    <span className="w-fit rounded-lg bg-paper px-2.5 py-1.5 text-xs font-bold">{live.code}</span>
                    <span className="text-[0.6875rem] text-subtle">−{live.discount} %</span>
                  </span>
                ) : (
                  <span key="c" className="text-[0.6875rem] text-subtle">Aucune campagne</span>
                );
              })(),
              <span key="k" className="text-muted">{r.clicks}</span>,
              <span key="v" className="flex flex-col">
                <span className="font-bold">{r.orders}</span>
                <span className="text-[0.6875rem] text-subtle">
                  {r.byCode} code · {r.byLink} lien
                </span>
              </span>,
              <span key="ca" className="font-extrabold whitespace-nowrap">{formatEuroShort(r.revenue)}</span>,
              <span key="com" className="font-semibold text-muted">{r.influencer.commission ? formatEuroShort(r.commission) : "—"}</span>,
              <span key="s" className="flex justify-end">
                <Pill tone={r.influencer.active ? "ok" : "muted"}>{r.influencer.active ? "Active" : "En pause"}</Pill>
              </span>,
            ],
          };
        })}
      />

        </>
      )}

      <Card title="E-mail d'invitation">
        <p className="-mt-1 text-[0.8125rem] leading-relaxed text-subtle">
          Envoyé depuis la fiche d'un partenaire, avec son lien personnel. Les mêmes textes servent à tous.
        </p>
        <PartnerWelcomeEditor
          saved={templateValues[PARTNER_WELCOME_ID] ?? {}}
          brand={brandFromSettings(settings, siteUrl)}
          base={siteUrl}
          action={savePartnerWelcomeAction}
        />
      </Card>
    </>
  );
}

/*
 * Ce que les partenaires nous doivent encore : une ligne par campagne, les plus en
 * retard d'abord.
 *
 * Le nombre attendu ne se saisit pas ici, et c'est voulu : il se dit sur le contrat
 * (/admin/contrats), d'où toutes ses campagnes l'héritent. Cet écran ne fait que
 * soustraire — il montre, il ne règle pas. Une campagne sous contrat dont la quantité
 * n'a jamais été écrite s'affiche quand même, justement pour qu'on aille l'écrire.
 */
function ContentDuesList({ dues }: { dues: ReturnType<typeof contentDues> }) {
  const { rows, totals } = dues;
  const count = (n: number, one: string) => `${n} ${one}${n > 1 ? "s" : ""}`;

  return (
    <>
      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile
          tone={totals.late > 0 ? "sand" : "green"}
          label="Campagnes à relancer"
          value={totals.late}
          note={totals.late > 0 ? "il y manque des contenus" : "tout le monde est à jour"}
        />
        <Tile
          label="Photos"
          value={`${totals.receivedPhotos} / ${totals.expectedPhotos}`}
          note={totals.missingPhotos > 0 ? `il en manque ${totals.missingPhotos}` : "rien ne manque"}
        />
        <Tile
          label="Vidéos"
          value={`${totals.receivedVideos} / ${totals.expectedVideos}`}
          note={totals.missingVideos > 0 ? `il en manque ${totals.missingVideos}` : "rien ne manque"}
        />
        <Tile
          tone={totals.toFill > 0 ? "blue" : "white"}
          label="Quantité à renseigner"
          value={totals.toFill}
          note={totals.toFill > 0 ? "campagnes sous contrat sans chiffre" : "toutes les campagnes ont le leur"}
        />
      </div>

      <GridTable
        columns="1fr 1fr 110px 110px 1fr"
        head={["Partenaire", "Campagne", "Photos", "Vidéos", "Reste à recevoir"]}
        empty="Aucune campagne sous contrat pour l'instant. La quantité attendue s'écrit sur le contrat, dans Contrats — toutes ses campagnes en héritent."
        rows={rows.map((r) => ({
          key: r.campaign.id,
          href: `/admin/influenceurs/${r.influencerId}/campagnes/${r.campaign.id}`,
          cells: [
            <span key="p" className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{r.influencerName}</span>
              <span className="truncate text-[0.6875rem] text-subtle">{r.contractName || (r.campaign.contractId ? "contrat retiré" : "sans contrat")}</span>
            </span>,
            <span key="c" className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{r.campaign.name || `Campagne n° ${r.campaign.seq}`}</span>
              <span className="truncate text-[0.6875rem] text-subtle">{CAMPAIGN_STATUS_LABELS[r.campaign.status]}</span>
            </span>,
            <Count key="ph" received={r.received.photos} expected={r.expected.photos} />,
            <Count key="vi" received={r.received.videos} expected={r.expected.videos} />,
            <span key="r" className="flex justify-end">
              {r.missing.agreed ? (
                <Pill tone={r.missing.done ? "ok" : "warn"}>{shortfallLabel(r.missing)}</Pill>
              ) : (
                <Pill tone="blue">Quantité à renseigner</Pill>
              )}
            </span>,
          ],
          detail: r.missing.agreed ? progressLabel(r.expected, r.received) : "Le contrat ne dit pas encore combien de photos ni de vidéos il réclame.",
        }))}
      />

      <p className="text-[0.8125rem] leading-relaxed text-subtle">
        Le nombre attendu se règle sur le contrat, et une fois pour toutes : {count(rows.length, "campagne")} se
        {rows.length > 1 ? "rvent" : "rt"} ici de quelques contrats seulement. Une campagne peut y déroger depuis sa
        propre fiche, si l'on a convenu autrement avec la personne.
      </p>
    </>
  );
}

/** « 12 sur 40 », ou rien quand rien n'est attendu de ce côté-là. */
function Count({ received, expected }: { received: number; expected: number }) {
  if (expected === 0) return <span className="text-[0.6875rem] text-subtle">{received > 0 ? `${received} reçue${received > 1 ? "s" : ""}` : "—"}</span>;
  return (
    <span className="flex flex-col">
      <span className={`font-bold ${received >= expected ? "" : "text-muted"}`}>
        {received} <span className="font-semibold text-subtle">sur {expected}</span>
      </span>
    </span>
  );
}

/*
 * La liste de démarchage : qui on a repéré, où le trouver, où en est la conversation.
 *
 * Le statut se change sur place — la liste déroulante poste son formulaire toute seule.
 * La ligne entière n'est donc pas un lien, sinon changer un statut ouvrirait la fiche :
 * c'est le nom qui mène à la fiche.
 */
function OutreachList({ influencers }: { influencers: Influencer[] }) {
  const counts = OutreachStatus.options.map((status) => ({
    status,
    n: influencers.filter((i) => i.outreach === status).length,
  }));
  /* Les moins avancés d'abord : c'est là qu'il reste quelque chose à faire. */
  const order: Record<OutreachStatus, number> = { todo: 0, contacted: 1, talking: 2, validated: 3, collab: 4 };
  const sorted = [...influencers].sort((a, b) => order[a.outreach] - order[b.outreach] || a.name.localeCompare(b.name, "fr"));

  return (
    <>
      <div className="grid grid-cols-5 gap-3 max-[1399px]:grid-cols-3 max-[899px]:grid-cols-2">
        {counts.map(({ status, n }) => (
          <Tile
            key={status}
            tone={status === "collab" ? "green" : status === "validated" ? "blue" : status === "todo" ? "white" : "sand"}
            label={OUTREACH_LABELS[status]}
            value={n}
            note={n === 0 ? "personne" : n > 1 ? `${n} personnes` : "1 personne"}
          />
        ))}
      </div>

      <GridTable
        columns="minmax(160px, 1fr) minmax(180px, 1.1fr) 200px minmax(180px, 1fr) 130px"
        head={["Nom", "Réseaux sociaux", "Où on en est", "E-mail", "Son espace"]}
        empty="Personne pour l'instant. Ajoutez une fiche avec « Nouvel influenceur » : un nom suffit pour commencer à suivre un échange."
        rows={sorted.map((inf) => {
          const links = socialLinks(inf.socials);
          return {
            key: inf.id,
            cells: [
              <Link key="n" href={`/admin/influenceurs/${inf.id}`} className="flex min-w-0 flex-col hover:opacity-70">
                <span className="truncate font-bold">{inf.name}</span>
                {!inf.active && <span className="text-[0.6875rem] text-subtle">En pause</span>}
              </Link>,
              <span key="r" className="flex flex-wrap items-center gap-1.5">
                {links.length === 0 && <span className="text-[0.6875rem] text-subtle">Aucun réseau renseigné</span>}
                {links.map((l) =>
                  l.url ? (
                    <a
                      key={l.label}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-pill bg-paper px-2.5 py-1 text-[0.6875rem] font-bold hover:opacity-70"
                      title={`${l.label} — ${l.url}`}
                    >
                      {l.handle}
                    </a>
                  ) : (
                    <span key={l.label} className="rounded-pill bg-paper px-2.5 py-1 text-[0.6875rem] font-bold text-subtle" title={l.label}>
                      {l.handle}
                    </span>
                  ),
                )}
              </span>,
              <ActionForm key="s" action={setInfluencerOutreachAction} hideFooter className="!gap-0">
                <input type="hidden" name="id" value={inf.id} />
                <AutoSubmitSelect
                  name="outreach"
                  label={`Où on en est avec ${inf.name}`}
                  value={inf.outreach}
                  options={OutreachStatus.options.map((o) => ({ value: o, label: OUTREACH_LABELS[o] }))}
                />
              </ActionForm>,
              inf.email ? (
                <a key="e" href={`mailto:${inf.email}`} className="truncate text-[0.8125rem] text-muted hover:opacity-70">
                  {inf.email}
                </a>
              ) : (
                <span key="e" className="text-[0.6875rem] text-subtle">Pas d&apos;adresse</span>
              ),
              /* Voir la page telle qu'il la voit : une vue, jamais une connexion. */
              <form key="v" action={viewAsPartnerAction} className="flex justify-end">
                <input type="hidden" name="id" value={inf.id} />
                <button type="submit" className="whitespace-nowrap rounded-pill bg-paper px-3 py-2 text-[0.6875rem] font-bold hover:opacity-70">
                  Voir son espace
                </button>
              </form>,
            ],
          };
        })}
      />
    </>
  );
}
