import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSwitch } from "@/components/admin/AutoSubmitSwitch";
import { CodeInput, CopyButton } from "@/components/admin/CodeInput";
import { ButtonLink, Card, Field, GridTable, Input, PageHeader, Pill, Select, Tile } from "@/components/admin/ui";
import { deleteInfluencerAction, saveInfluencerAction, toggleInfluencerAction } from "@/lib/admin/actions/influencers";
import { adminSnapshot } from "@/lib/admin/counts";
import { listInfluencers, listRefClicksSince } from "@/lib/db/promos";
import { formatEuro, formatEuroShort } from "@/lib/domain/money";
import { Platform } from "@/lib/domain/types";
import { influencerStats } from "@/lib/promos/stats";

export const dynamic = "force-dynamic";

/*
 * Influenceurs (maquette) : quatre tuiles sur 30 jours, le tableau, et à droite la
 * fiche de l'influenceur sélectionné (code, lien de suivi, commission) puis ses ventes
 * attribuées (14 jours, code vs lien) et les dernières commandes.
 */

const PLATFORM_TONE: Record<string, { bg: string; fg: string }> = {
  Instagram: { bg: "bg-tint-pink", fg: "text-tint-pink-ink" },
  TikTok: { bg: "bg-tint-blue", fg: "text-tint-blue-ink" },
  YouTube: { bg: "bg-tint-sand", fg: "text-tint-sand-ink" },
  Blog: { bg: "bg-tint-green", fg: "text-tint-green-ink" },
  Autre: { bg: "bg-paper", fg: "text-ink" },
};

export default async function InfluencersPage({ searchParams }: PageProps<"/admin/influenceurs">) {
  const sp = await searchParams;
  const selectedId = typeof sp.id === "string" ? sp.id : "";
  const [influencers, snap] = await Promise.all([listInfluencers(), adminSnapshot()]);
  const now = snap.now;
  const since = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);
  const clicks = await listRefClicksSince(since).catch(() => []);
  const { rows, totals } = influencerStats(influencers, snap.orders, clicks, now);
  const isNew = selectedId === "nouveau";
  const current = !isNew ? rows.find((r) => r.influencer.id === selectedId) ?? (selectedId ? undefined : rows[0]) : undefined;
  const inf = current?.influencer;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/^https?:\/\//, "");
  const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const maxSpark = Math.max(1, ...(current?.spark.map((d) => d.code + d.link) ?? [1]));

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
            <ButtonLink href="/admin/influenceurs?id=nouveau" tone="primary">
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

      <div className="grid grid-cols-[1fr_360px] items-start gap-3 max-[1099px]:grid-cols-1">
        <GridTable
          columns="1fr 130px 70px 90px 100px 90px 90px"
          head={["Influenceur", "Code", "Clics", "Ventes", "CA", "Commission", "Statut"]}
          empty="Aucun influenceur. Ajoutez le premier à droite : il reçoit un code et un lien de suivi."
          rows={rows.map((r) => {
            const tone = PLATFORM_TONE[r.influencer.platform] ?? PLATFORM_TONE.Autre;
            return {
              key: r.influencer.id,
              href: `/admin/influenceurs?id=${r.influencer.id}`,
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
                <span key="c" className={`w-fit rounded-lg px-2.5 py-1.5 text-xs font-bold ${inf?.id === r.influencer.id ? "bg-ink text-white" : "bg-paper"}`}>{r.influencer.code}</span>,
                <span key="k" className="text-muted">{r.clicks}</span>,
                <span key="v" className="flex flex-col">
                  <span className="font-bold">{r.orders}</span>
                  <span className="text-[0.6875rem] text-subtle">
                    {r.byCode} code · {r.byLink} lien
                  </span>
                </span>,
                <span key="ca" className="font-extrabold whitespace-nowrap">{formatEuroShort(r.revenue)}</span>,
                <span key="com" className="font-semibold text-muted">{formatEuroShort(r.commission)}</span>,
                <span key="s" className="flex justify-end">
                  <Pill tone={r.influencer.active ? "ok" : "muted"}>{r.influencer.active ? "Active" : "En pause"}</Pill>
                </span>,
              ],
            };
          })}
        />

        <div className="sticky top-6 flex flex-col gap-3">
          <Card
            title={isNew || !inf ? "Nouvel influenceur" : inf.name}
            aside={
              inf && !isNew ? (
                <ActionForm action={toggleInfluencerAction} hideFooter className="!gap-0">
                  <input type="hidden" name="id" value={inf.id} />
                  <AutoSubmitSwitch label={inf.active ? "Mettre en pause" : "Réactiver"} defaultChecked={inf.active} />
                </ActionForm>
              ) : undefined
            }
          >
            <ActionForm key={isNew ? "new" : inf?.id ?? "none"} action={saveInfluencerAction} submitLabel="Enregistrer">
              <input type="hidden" name="id" value={inf && !isNew ? inf.id : ""} />
              <input type="hidden" name="active" value={inf && !isNew ? (inf.active ? "on" : "") : "on"} />
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Nom" name="name">
                  <Input name="name" required defaultValue={inf && !isNew ? inf.name : ""} placeholder="Marie Petit-Pas" className="!rounded-xl !py-3 !text-[0.8125rem] !font-bold" />
                </Field>
                <Field label="Pseudo" name="handle">
                  <Input name="handle" defaultValue={inf && !isNew ? inf.handle : ""} placeholder="@mariepetitpas" className="!rounded-xl !py-3 !text-[0.8125rem]" />
                </Field>
              </div>
              <Field label="Plateforme" name="platform">
                <Select name="platform" defaultValue={inf && !isNew ? inf.platform : "Instagram"} className="!rounded-xl !py-3 !text-[0.8125rem]">
                  {Platform.options.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-subtle">Code promo</span>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <CodeInput name="code" initial={inf && !isNew ? inf.code : ""} placeholder="MARIE10" generate={false} />
                  </div>
                  <span className="flex items-center rounded-xl bg-paper px-3">
                    <input name="discount" type="number" min={0} max={100} defaultValue={inf && !isNew ? inf.discount : 10} className="w-10 bg-transparent py-3 text-right text-sm font-extrabold outline-none" />
                    <span className="text-[0.8125rem] font-extrabold">%</span>
                  </span>
                </div>
                <span className="text-[0.6875rem] text-subtle">Remise offerte au client. Le code est attribué à cet influenceur.</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-subtle">Lien de suivi</span>
                <div className="flex items-center gap-2 rounded-xl bg-paper py-1.5 pl-3.5 pr-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">
                    {site}/?ref=
                    <input name="slug" defaultValue={inf && !isNew ? inf.slug : ""} placeholder="marie" className="w-[40%] bg-transparent font-extrabold text-ink outline-none placeholder:font-semibold placeholder:text-faint" />
                  </span>
                  {inf && !isNew && <CopyButton text={`https://${site}/?ref=${inf.slug}`} />}
                </div>
                <span className="text-[0.6875rem] text-subtle">Cookie d'attribution 30 jours. La remise du code s'applique automatiquement au panier via le lien.</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
                  <span>Commission</span>
                  <span className="flex items-center rounded-xl bg-paper px-3">
                    <input name="rate" type="number" min={0} max={100} defaultValue={inf && !isNew ? inf.rate : 10} className="min-w-0 flex-1 bg-transparent py-3 text-[0.8125rem] font-bold text-ink outline-none" />
                    <span className="whitespace-nowrap text-xs font-bold text-ink">% du CA HT</span>
                  </span>
                </label>
                <Field label="Fin de campagne" hint="Vide : sans fin." name="endAt">
                  <Input name="endAt" type="date" defaultValue={inf?.endAt && !isNew ? new Date(inf.endAt).toISOString().slice(0, 10) : ""} className="!rounded-xl !py-3 !text-[0.8125rem]" />
                </Field>
              </div>
            </ActionForm>
            {inf && !isNew && (
              <ActionForm action={deleteInfluencerAction} submitLabel="Supprimer" submitTone="ghost" confirm={`Supprimer ${inf.name} ? Son code et son lien cesseront de fonctionner ; les ventes passées restent attribuées.`} className="!gap-0 border-t border-line-soft pt-3 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent">
                <input type="hidden" name="id" value={inf.id} />
              </ActionForm>
            )}
          </Card>

          {current && !isNew && (
            <Card title={<span className="text-sm">Ventes attribuées · {current.influencer.name}</span>} aside={<span className="text-[0.6875rem] font-semibold text-subtle">30 derniers jours</span>} className="!gap-3">
              <div className="flex h-[70px] items-end gap-1" aria-label="Ventes des 14 derniers jours">
                {current.spark.map((d) => (
                  <span key={d.day} className="flex flex-1 flex-col justify-end gap-px" title={`${d.day} · ${d.code} code · ${d.link} lien`}>
                    <span className="rounded-t bg-tint-green" style={{ height: `${Math.round((d.link / maxSpark) * 66)}px` }} />
                    <span className="rounded-t bg-ink" style={{ height: `${Math.max(d.code + d.link ? 0 : 4, Math.round((d.code / maxSpark) * 66))}px` }} />
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
                {current.recent.length === 0 && <span className="py-3 text-xs text-subtle">Aucune vente attribuée sur la période.</span>}
                {current.recent.map(({ order, via }) => (
                  <Link key={order.id} href={`/admin/commandes/${order.id}`} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 border-b border-line-soft py-2.5 text-xs hover:opacity-70">
                    <span className="font-bold">{order.number.replace(/^MV-\d{4}-/, "#")}</span>
                    <span className="truncate text-muted">{order.shippingAddress.name}</span>
                    <span className={`rounded-pill px-2 py-[3px] text-[0.625rem] font-bold ${via === "code" ? "bg-ink text-white" : "bg-tint-green text-tint-green-ink"}`}>{via === "code" ? `code ${current.influencer.code}` : "lien"}</span>
                    <span className="whitespace-nowrap font-extrabold">{formatEuro(order.totals.total)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
