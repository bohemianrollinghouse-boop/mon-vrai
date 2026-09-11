import { ButtonLink, Card, GridTable, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { savePartnerWelcomeAction } from "@/lib/admin/actions/influencers";
import { PartnerWelcomeEditor } from "@/components/admin/PartnerWelcomeEditor";
import { getAllTemplateValues } from "@/lib/db/newsletter";
import { getSettings } from "@/lib/db/settings";
import { brandFromSettings } from "@/lib/email/newsletter";
import { PARTNER_WELCOME_ID } from "@/lib/newsletter/render";
import { adminSnapshot } from "@/lib/admin/counts";
import { listInfluencers, listRefClicksSince } from "@/lib/db/promos";
import { formatEuroShort } from "@/lib/domain/money";
import { influencerStats } from "@/lib/promos/stats";

export const dynamic = "force-dynamic";

/*
 * Influenceurs : les quatre chiffres de la campagne sur 30 jours, la liste, puis
 * l'e-mail d'invitation commun à tous. Tout ce qui concerne UN partenaire — sa fiche,
 * ses ventes, son kit, ses relevés — vit sur sa propre page, /admin/influenceurs/<id>.
 */

const PLATFORM_TONE: Record<string, { bg: string; fg: string }> = {
  Instagram: { bg: "bg-tint-pink", fg: "text-tint-pink-ink" },
  TikTok: { bg: "bg-tint-blue", fg: "text-tint-blue-ink" },
  YouTube: { bg: "bg-tint-sand", fg: "text-tint-sand-ink" },
  Blog: { bg: "bg-tint-green", fg: "text-tint-green-ink" },
  Autre: { bg: "bg-paper", fg: "text-ink" },
};

export default async function InfluencersPage() {
  const [influencers, snap, templateValues, settings] = await Promise.all([listInfluencers(), adminSnapshot(), getAllTemplateValues(), getSettings()]);
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

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile tone="green" label="CA attribué (30 j)" value={formatEuroShort(totals.revenue)} note={`${pct(totals.share)} du CA total`} />
        <Tile label="Ventes attribuées" value={totals.orders} note={`${totals.byCode} via code · ${totals.byLink} via lien`} />
        <Tile label="Clics sur les liens" value={totals.clicks.toLocaleString("fr-FR")} note={`taux de conversion ${pct(totals.conversion)}`} />
        <Tile tone="sand" label="Commissions dues" value={formatEuroShort(totals.commission)} note="à régler en fin de mois" />
      </div>

      <GridTable
        columns="1fr 130px 70px 90px 100px 90px 90px"
        head={["Influenceur", "Code", "Clics", "Ventes", "CA", "Commission", "Statut"]}
        empty="Aucun influenceur. Ajoutez le premier avec « Nouvel influenceur » : il reçoit un code et un lien de suivi."
        rows={rows.map((r) => {
          const tone = PLATFORM_TONE[r.influencer.platform] ?? PLATFORM_TONE.Autre;
          return {
            key: r.influencer.id,
            href: `/admin/influenceurs/${r.influencer.id}`,
            cells: [
              <span key="n" className="flex items-center gap-2.5">
                <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill text-xs font-bold ${tone.bg} ${tone.fg}`}>{initials(r.influencer.name)}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-bold">{r.influencer.name}</span>
                  <span className="truncate text-[0.6875rem] text-subtle">
                    {r.influencer.handle || r.influencer.slug} · {r.influencer.platform}
                  </span>
                </span>
              </span>,
              <span key="c" className="w-fit rounded-lg bg-paper px-2.5 py-1.5 text-xs font-bold">{r.influencer.code}</span>,
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
