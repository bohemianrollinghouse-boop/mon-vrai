import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSwitch } from "@/components/admin/AutoSubmitSwitch";
import { CodeInput } from "@/components/admin/CodeInput";
import { PromoTypeFields } from "@/components/admin/PromoTypeFields";
import { ButtonLink, Card, Field, FilterPills, GridTable, Input, PageHeader, Pill, type PillTone } from "@/components/admin/ui";
import { deletePromoAction, savePartnerPromoAction, savePromoAction, setCollectionOfferAction, togglePromoAction } from "@/lib/admin/actions/promos";
import { adminSnapshot } from "@/lib/admin/counts";
import { listInfluencers, listPromos } from "@/lib/db/promos";
import { getSettings } from "@/lib/db/settings";
import { formatEuro } from "@/lib/domain/money";
import type { Influencer, Product, Promo } from "@/lib/domain/types";
import { promoLabel, promoStatus } from "@/lib/promos/engine";
import { promoStats } from "@/lib/promos/stats";

export const dynamic = "force-dynamic";

/*
 * Codes promo (maquette « Codes promo ») : filtres, tableau, éditeur collant à droite.
 *
 * Tous les codes sont ici, maison et partenaires — un code promo reste un code promo,
 * et les chercher à deux endroits selon qui les porte n'avait pas de sens. Ils ne se
 * règlent pas de la même façon pour autant : un code maison se décrit entièrement ici,
 * tandis que celui d'un partenaire tient sa remise, ses dates et son extinction de sa
 * campagne, dont il n'est que le reflet (voir db/campaigns.syncCampaignPromo). Son
 * éditeur ne propose donc que ce qui lui appartient en propre — panier minimum,
 * limites, cumul, port offert —, et renvoie à la campagne pour le reste.
 */

const STATUS_TONE: Record<string, PillTone> = { Actif: "ok", Programmé: "warn", Expiré: "muted" };
const FILTERS = ["Tous", "Actif", "Programmé", "Expiré"] as const;
const ORIGINS = ["Tous", "Maison", "Partenaires"] as const;

const date = (ts?: number) => (ts ? new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "-");
const iso = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");
const euros = (cents?: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");

export default async function PromosPage({ searchParams }: PageProps<"/admin/codes-promo">) {
  const sp = await searchParams;
  const filter = typeof sp.statut === "string" && FILTERS.includes(sp.statut as never) ? (sp.statut as (typeof FILTERS)[number]) : "Tous";
  const origin = typeof sp.origine === "string" && ORIGINS.includes(sp.origine as never) ? (sp.origine as (typeof ORIGINS)[number]) : "Tous";
  const selectedCode = typeof sp.code === "string" ? sp.code.toUpperCase() : "";
  const [all, snap, settings, influencers] = await Promise.all([listPromos(), adminSnapshot(), getSettings(), listInfluencers()]);
  const now = snap.now;
  const collectionOfferEnabled = settings.promos.collectionOffer.enabled;
  const house = all.filter((p) => !p.influencerId);
  const partnerCodes = all.filter((p) => p.influencerId);
  const partners = new Map(influencers.map((i) => [i.id, i]));
  const stats = promoStats(all, snap.orders);

  const scoped = origin === "Maison" ? house : origin === "Partenaires" ? partnerCodes : all;
  const withStatus = scoped.map((p) => ({ p, status: promoStatus(p, now) }));
  const rows = withStatus.filter((x) => filter === "Tous" || x.status === filter);
  const isNew = selectedCode === "NOUVEAU";
  const current = isNew ? undefined : selectedCode ? all.find((p) => p.code === selectedCode) : rows[0]?.p;
  const products = snap.products.filter((p) => p.status === "published").map((p) => ({ slug: p.slug, title: p.title, image: p.images[0]?.url, tint: p.tint }));

  /** Un lien de cette page, les filtres courants conservés. */
  const link = (next: { statut?: string; origine?: string; code?: string } = {}) => {
    const params = new URLSearchParams();
    const statut = next.statut ?? filter;
    const origine = next.origine ?? origin;
    if (statut !== "Tous") params.set("statut", statut);
    if (origine !== "Tous") params.set("origine", origine);
    if (next.code) params.set("code", next.code);
    const q = params.toString();
    return q ? `/admin/codes-promo?${q}` : "/admin/codes-promo";
  };

  return (
    <>
      <PageHeader
        title="Codes promo"
        subtitle="Les codes maison et ceux des partenaires. Pour un code de partenaire, la remise et les dates viennent de sa campagne ; tout le reste se règle ici."
        actions={
          <ButtonLink href="/admin/codes-promo?code=nouveau" tone="primary">
            + Nouveau code
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-2">
        <FilterPills items={ORIGINS.map((o) => ({ href: link({ origine: o }), label: o === "Tous" ? "Tous les codes" : o, count: o === "Tous" ? all.length : o === "Maison" ? house.length : partnerCodes.length, active: origin === o }))} />
        <FilterPills items={FILTERS.map((f) => ({ href: link({ statut: f }), label: f, count: f === "Tous" ? withStatus.length : withStatus.filter((x) => x.status === f).length, active: filter === f }))} />
      </div>

      <Card
        title="Offre « collection complète » — un livre offert"
        className="mb-3"
        aside={
          <ActionForm action={setCollectionOfferAction} hideFooter className="!gap-0">
            <AutoSubmitSwitch label={collectionOfferEnabled ? "Désactiver l'offre" : "Activer l'offre"} defaultChecked={collectionOfferEnabled} />
          </ActionForm>
        }
      >
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Automatique, sans code : quand un panier contient tous les imagiers publiés, le titre le moins cher est offert (un exemplaire). La remise s'applique seule au panier et au paiement. Activée, l'offre affiche aussi l'encart « Précommander la collection » du catalogue et le bloc « Compléter la collection » du panier.{" "}
          <strong className={collectionOfferEnabled ? "text-tint-green-ink" : "text-subtle"}>{collectionOfferEnabled ? "Offre active." : "Offre désactivée."}</strong>
        </p>
      </Card>

      <div className="grid grid-cols-[1fr_360px] items-start gap-3 max-[1099px]:grid-cols-1">
        <GridTable
          columns="150px 1fr 110px 110px 120px 90px"
          head={["Code", "Description", "Remise", "Utilisations", "Validité", "Statut"]}
          empty="Aucun code ici. Créez le premier à droite."
          rows={rows.map(({ p, status }) => {
            const st = stats.get(p.code) ?? { uses: p.uses, revenue: 0 };
            const partner = p.influencerId ? partners.get(p.influencerId) : undefined;
            return {
              key: p.code,
              href: link({ code: p.code }),
              cells: [
                <span key="c" className={`w-fit rounded-lg px-2.5 py-1.5 text-xs font-extrabold tracking-[0.04em] ${current?.code === p.code ? "bg-ink text-on-ink" : "bg-paper"}`}>{p.code}</span>,
                <span key="d" className="flex flex-col">
                  <span className="truncate font-semibold">{p.description || "-"}</span>
                  <span className="text-[0.6875rem] text-subtle">
                    {p.influencerId ? `Partenaire${partner ? ` · ${partner.name}` : ""} · ` : ""}
                    {p.minimum ? `dès ${formatEuro(p.minimum)}` : "sans minimum"} · {p.stackWith.length ? `cumulable (${p.stackWith.length})` : "non cumulable"}
                  </span>
                </span>,
                <span key="r" className="font-bold">{promoLabel(p)}</span>,
                <span key="u" className="flex flex-col">
                  <span className="font-bold">{p.limit ? `${st.uses} / ${p.limit}` : st.uses}</span>
                  <span className="text-[0.6875rem] text-subtle">{formatEuro(st.revenue)} de CA</span>
                </span>,
                <span key="v" className="text-xs font-semibold text-muted">{p.endAt ? `${date(p.startAt)} → ${date(p.endAt)}` : `depuis le ${date(p.startAt)}`}</span>,
                <span key="s" className="flex justify-end">
                  <Pill tone={STATUS_TONE[status]}>{status}</Pill>
                </span>,
              ],
            };
          })}
        />

        {current?.influencerId && !isNew ? (
          <PartnerEditor promo={current} partner={partners.get(current.influencerId)} status={promoStatus(current, now)} house={house} partnerCount={partnerCodes.length} />
        ) : (
          <HouseEditor current={current} isNew={isNew} house={house} partnerCount={partnerCodes.length} products={products} now={now} />
        )}
      </div>
    </>
  );
}

type ProductOpt = { slug: string; title: string; image?: string; tint: Product["tint"] };

/** Un code maison : il se décrit tout entier ici — type, valeur, dates, limites. */
function HouseEditor({ current, isNew, house, partnerCount, products, now }: { current?: Promo; isNew: boolean; house: Promo[]; partnerCount: number; products: ProductOpt[]; now: number }) {
  const editing = current && !isNew ? current : undefined;
  return (
    <Card
      className="sticky top-6"
      title={editing ? editing.code : "Nouveau code"}
      aside={
        editing ? (
          <ActionForm action={togglePromoAction} hideFooter className="!gap-0">
            <input type="hidden" name="code" value={editing.code} />
            <AutoSubmitSwitch label={editing.active ? "Désactiver" : "Activer"} defaultChecked={editing.active} />
          </ActionForm>
        ) : undefined
      }
    >
      <ActionForm key={isNew ? "new" : editing?.code ?? "none"} action={savePromoAction} submitLabel="Enregistrer">
        <input type="hidden" name="originalCode" value={editing ? editing.code : ""} />
        <input type="hidden" name="active" value={editing ? (editing.active ? "on" : "") : "on"} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-subtle">Code</span>
          <CodeInput name="code" initial={editing ? editing.code : ""} />
        </div>
        <Field label="Description interne" name="description">
          <Input name="description" defaultValue={editing ? editing.description : ""} placeholder="Première commande (newsletter)" className="!rounded-xl !py-3 !text-[0.8125rem]" />
        </Field>
        <PromoTypeFields
          initialType={editing ? editing.type : "percent"}
          initialValue={editing ? (editing.type === "fixed" ? (editing.amount / 100).toFixed(2).replace(".", ",") : String(editing.amount || 10)) : "10"}
          initialMinimum={editing ? euros(editing.minimum) : ""}
          initialGifts={editing ? editing.gifts : []}
          initialFreeShipping={editing ? editing.freeShipping : false}
          products={products}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Début" name="startAt">
            <Input name="startAt" type="date" defaultValue={editing ? iso(editing.startAt) : iso(now)} className="!rounded-xl !py-3 !text-[0.8125rem]" />
          </Field>
          <Field label="Fin" hint="Vide : sans fin." name="endAt">
            <Input name="endAt" type="date" defaultValue={editing ? iso(editing.endAt) : ""} className="!rounded-xl !py-3 !text-[0.8125rem]" />
          </Field>
        </div>
        <Limits limit={editing?.limit} />
        <StackPicker current={editing} house={house} partnerCount={partnerCount} />
      </ActionForm>
      {editing && (
        <ActionForm action={deletePromoAction} submitLabel="Supprimer" submitTone="ghost" confirm={`Supprimer le code ${editing.code} ?`} className="!gap-0 border-t border-line-soft pt-3 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent">
          <input type="hidden" name="code" value={editing.code} />
        </ActionForm>
      )}
    </Card>
  );
}

/*
 * Le code d'un partenaire. Ce que sa campagne décide — la remise, les dates,
 * l'extinction — est dit, pas proposé : le document promo n'en est que le reflet, et le
 * régler ici serait réécrit au prochain enregistrement de la campagne. Le bandeau du
 * haut renvoie donc à la campagne, et le formulaire ne porte que le reste.
 */
function PartnerEditor({ promo, partner, status, house, partnerCount }: { promo: Promo; partner?: Influencer; status: string; house: Promo[]; partnerCount: number }) {
  const campaignHref = promo.campaignId ? `/admin/influenceurs/${promo.influencerId}/campagnes/${promo.campaignId}` : `/admin/influenceurs/${promo.influencerId}?onglet=campagnes`;
  return (
    <Card className="sticky top-6" title={promo.code} aside={<Pill tone={STATUS_TONE[status]}>{status}</Pill>}>
      <div className="flex flex-col gap-2.5 rounded-[14px] bg-paper p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[0.8125rem] font-extrabold">{partner ? partner.name : "Partenaire supprimé"}</span>
          <span className="text-sm font-extrabold">{promoLabel(promo)}</span>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-subtle">
          {promo.endAt ? `Du ${date(promo.startAt)} au ${date(promo.endAt)}.` : `Depuis le ${date(promo.startAt)}.`} La remise, les dates et l'extinction viennent de sa campagne : ce code n'en est que le reflet, et les changer ici serait effacé à son prochain enregistrement.
          {!promo.active && " Code éteint : campagne terminée ou hors de ses dates, ou partenaire en pause."}
        </p>
        <ButtonLink href={campaignHref} tone="secondary" className="w-fit">
          Ouvrir la campagne
        </ButtonLink>
      </div>
      <ActionForm key={promo.code} action={savePartnerPromoAction} submitLabel="Enregistrer">
        <input type="hidden" name="code" value={promo.code} />
        <Field label="Panier minimum" hint="En euros. Vide : aucun." name="minimumEuros">
          <Input name="minimumEuros" defaultValue={euros(promo.minimum)} inputMode="decimal" placeholder="0" className="!rounded-xl !py-3 !text-[0.8125rem]" />
        </Field>
        <Limits limit={promo.limit} />
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-paper px-3 py-3">
          <input type="checkbox" name="freeShipping" defaultChecked={promo.freeShipping} className="h-[18px] w-[18px] accent-ink" />
          <span className="flex flex-col">
            <span className="text-[0.8125rem] font-bold text-ink">Offrir aussi les frais de livraison</span>
            <span className="text-[0.6875rem] text-subtle">En plus de la remise de la campagne.</span>
          </span>
        </label>
        <StackPicker current={promo} house={house} partnerCount={partnerCount} />
      </ActionForm>
    </Card>
  );
}

/** Limite totale et nombre par client, communs aux deux éditeurs. */
function Limits({ limit }: { limit?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Field label="Limite totale" name="limit">
        <Input name="limit" type="number" min={1} defaultValue={limit ?? ""} placeholder="Illimité" className="!rounded-xl !py-3 !text-[0.8125rem]" />
      </Field>
      <div className="flex flex-col gap-1.5 text-[0.8125rem] font-bold">
        <span className="text-xs font-semibold text-subtle">Par client</span>
        <span className="rounded-xl bg-paper px-3.5 py-3 text-[0.8125rem] font-bold">1</span>
      </div>
    </div>
  );
}

/*
 * Avec quoi ce code se cumule. Les codes de partenaires ne s'y listent pas un par un :
 * ils vont et viennent avec les campagnes, et c'est la famille entière qu'on autorise
 * ou non (`__influ`).
 */
function StackPicker({ current, house, partnerCount }: { current?: Promo; house: Promo[]; partnerCount: number }) {
  const chosen = current?.stackWith ?? [];
  const others = house.filter((p) => p.code !== current?.code);
  return (
    <details className="group flex flex-col gap-2">
      <summary className="flex cursor-pointer items-baseline justify-between text-xs font-semibold text-subtle">
        <span>Cumulable avec</span>
        <span className="text-[0.6875rem]">{chosen.length ? `${chosen.length} code${chosen.length > 1 ? "s" : ""}` : "Aucun"} ▾</span>
      </summary>
      <div className="mt-2 flex max-h-[220px] flex-col gap-0.5 overflow-auto rounded-[14px] bg-paper p-1.5">
        <StackOption value="__influ" label="Codes de partenaires" hint={`${partnerCount} code${partnerCount > 1 ? "s" : ""}`} checked={chosen.includes("__influ")} />
        {others.map((p) => (
          <StackOption key={p.code} value={p.code} label={p.code} hint={promoLabel(p)} checked={chosen.includes(p.code)} />
        ))}
        {others.length === 0 && partnerCount === 0 && <span className="px-3 py-2 text-xs text-subtle">Aucun autre code pour l'instant.</span>}
      </div>
      <span className="text-[0.6875rem] leading-relaxed text-subtle">Non coché = ce code ne peut pas être combiné avec l'autre dans un même panier.</span>
    </details>
  );
}

function StackOption({ value, label, hint, checked }: { value: string; label: string; hint: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[0.8125rem] font-semibold hover:bg-surface">
      <input type="checkbox" name="stackWith" value={value} defaultChecked={checked} className="h-[18px] w-[18px] accent-ink" />
      <span className="flex-1">{label}</span>
      <span className="text-[0.6875rem] font-semibold text-subtle">{hint}</span>
    </label>
  );
}
