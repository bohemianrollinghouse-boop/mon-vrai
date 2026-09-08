import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSwitch } from "@/components/admin/AutoSubmitSwitch";
import { CodeInput } from "@/components/admin/CodeInput";
import { PromoTypeFields } from "@/components/admin/PromoTypeFields";
import { ButtonLink, Card, Field, FilterPills, GridTable, Input, PageHeader, Pill, type PillTone } from "@/components/admin/ui";
import { deletePromoAction, savePromoAction, togglePromoAction } from "@/lib/admin/actions/promos";
import { adminSnapshot } from "@/lib/admin/counts";
import { listPromos } from "@/lib/db/promos";
import { formatEuro } from "@/lib/domain/money";
import { promoLabel, promoStatus } from "@/lib/promos/engine";
import { promoStats } from "@/lib/promos/stats";

export const dynamic = "force-dynamic";

/*
 * Codes promo (maquette « Codes promo ») : filtres par statut, tableau, éditeur collant
 * à droite. Les codes influenceurs n'apparaissent pas ici : ils vivent dans l'onglet
 * Influenceurs, mais peuvent être cités comme « cumulable avec ».
 */

const STATUS_TONE: Record<string, PillTone> = { Actif: "ok", Programmé: "warn", Expiré: "muted" };
const FILTERS = ["Tous", "Actif", "Programmé", "Expiré"] as const;

export default async function PromosPage({ searchParams }: PageProps<"/admin/codes-promo">) {
  const sp = await searchParams;
  const filter = typeof sp.statut === "string" && FILTERS.includes(sp.statut as never) ? sp.statut : "Tous";
  const selectedCode = typeof sp.code === "string" ? sp.code.toUpperCase() : "";
  const [all, snap] = await Promise.all([listPromos(), adminSnapshot()]);
  const now = snap.now;
  const promos = all.filter((p) => !p.influencerId);
  const influencerCodes = all.filter((p) => p.influencerId);
  const stats = promoStats(promos, snap.orders);
  const withStatus = promos.map((p) => ({ p, status: promoStatus(p, now) }));
  const rows = withStatus.filter((x) => filter === "Tous" || x.status === filter);
  const isNew = selectedCode === "NOUVEAU";
  const current = !isNew ? promos.find((p) => p.code === selectedCode) ?? (selectedCode ? undefined : promos[0]) : undefined;
  const date = (ts?: number) => (ts ? new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—");
  const iso = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");
  const products = snap.products.filter((p) => p.status === "published").map((p) => ({ slug: p.slug, title: p.title, image: p.images[0]?.url, tint: p.tint }));

  return (
    <>
      <PageHeader
        title="Codes promo"
        subtitle="Codes internes (opérations, service client). Les codes influenceurs se gèrent dans l'onglet Influenceurs."
        actions={
          <ButtonLink href="/admin/codes-promo?code=nouveau" tone="primary">
            + Nouveau code
          </ButtonLink>
        }
      />
      <FilterPills items={FILTERS.map((f) => ({ href: f === "Tous" ? "/admin/codes-promo" : `/admin/codes-promo?statut=${f}`, label: f, count: f === "Tous" ? withStatus.length : withStatus.filter((x) => x.status === f).length, active: filter === f }))} />

      <div className="grid grid-cols-[1fr_360px] items-start gap-3 max-[1099px]:grid-cols-1">
        <GridTable
          columns="150px 1fr 110px 110px 120px 90px"
          head={["Code", "Description", "Remise", "Utilisations", "Validité", "Statut"]}
          empty="Aucun code. Créez le premier à droite."
          rows={rows.map(({ p, status }) => {
            const st = stats.get(p.code) ?? { uses: p.uses, revenue: 0 };
            return {
              key: p.code,
              href: `/admin/codes-promo?code=${p.code}${filter !== "Tous" ? `&statut=${filter}` : ""}`,
              cells: [
                <span key="c" className={`w-fit rounded-lg px-2.5 py-1.5 text-xs font-extrabold tracking-[0.04em] ${current?.code === p.code ? "bg-ink text-white" : "bg-paper"}`}>{p.code}</span>,
                <span key="d" className="flex flex-col">
                  <span className="truncate font-semibold">{p.description || "—"}</span>
                  <span className="text-[0.6875rem] text-subtle">
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

        <Card className="sticky top-6" title={isNew || !current ? "Nouveau code" : current.code} aside={current && !isNew ? <ActionForm action={togglePromoAction} hideFooter className="!gap-0"><input type="hidden" name="code" value={current.code} /><AutoSubmitSwitch label={current.active ? "Désactiver" : "Activer"} defaultChecked={current.active} /></ActionForm> : undefined}>
          <ActionForm key={isNew ? "new" : current?.code ?? "none"} action={savePromoAction} submitLabel="Enregistrer">
            <input type="hidden" name="originalCode" value={current && !isNew ? current.code : ""} />
            {(isNew || !current) && <input type="hidden" name="active" value="on" />}
            {current && !isNew && <input type="hidden" name="active" value={current.active ? "on" : ""} />}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-subtle">Code</span>
              <CodeInput name="code" initial={current && !isNew ? current.code : ""} />
            </div>
            <Field label="Description interne" name="description">
              <Input name="description" defaultValue={current && !isNew ? current.description : ""} placeholder="Première commande (newsletter)" className="!rounded-xl !py-3 !text-[0.8125rem]" />
            </Field>
            <PromoTypeFields
              initialType={current && !isNew ? current.type : "percent"}
              initialValue={current && !isNew ? (current.type === "fixed" ? (current.amount / 100).toFixed(2).replace(".", ",") : String(current.amount || 10)) : "10"}
              initialMinimum={current && !isNew && current.minimum ? (current.minimum / 100).toFixed(2).replace(".", ",") : ""}
              initialGifts={current && !isNew ? current.gifts : []}
              products={products}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Début" name="startAt">
                <Input name="startAt" type="date" defaultValue={current && !isNew ? iso(current.startAt) : iso(now)} className="!rounded-xl !py-3 !text-[0.8125rem]" />
              </Field>
              <Field label="Fin" hint="Vide : sans fin." name="endAt">
                <Input name="endAt" type="date" defaultValue={current && !isNew ? iso(current.endAt) : ""} className="!rounded-xl !py-3 !text-[0.8125rem]" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Limite totale" name="limit">
                <Input name="limit" type="number" min={1} defaultValue={current && !isNew ? current.limit ?? "" : ""} placeholder="Illimité" className="!rounded-xl !py-3 !text-[0.8125rem]" />
              </Field>
              <div className="flex flex-col gap-1.5 text-[0.8125rem] font-bold">
                <span className="text-xs font-semibold text-subtle">Par client</span>
                <span className="rounded-xl bg-paper px-3.5 py-3 text-[0.8125rem] font-bold">1</span>
              </div>
            </div>
            <details className="group flex flex-col gap-2">
              <summary className="flex cursor-pointer items-baseline justify-between text-xs font-semibold text-subtle">
                <span>Cumulable avec</span>
                <span className="text-[0.6875rem]">{current && !isNew && current.stackWith.length ? `${current.stackWith.length} code${current.stackWith.length > 1 ? "s" : ""}` : "Aucun"} ▾</span>
              </summary>
              <div className="mt-2 flex max-h-[220px] flex-col gap-0.5 overflow-auto rounded-[14px] bg-paper p-1.5">
                <StackOption value="__influ" label="Codes influenceurs" hint={`${influencerCodes.length} code${influencerCodes.length > 1 ? "s" : ""}`} checked={Boolean(current && !isNew && current.stackWith.includes("__influ"))} />
                {promos
                  .filter((p) => p.code !== current?.code)
                  .map((p) => (
                    <StackOption key={p.code} value={p.code} label={p.code} hint={promoLabel(p)} checked={Boolean(current && !isNew && current.stackWith.includes(p.code))} />
                  ))}
                {promos.length <= 1 && influencerCodes.length === 0 && <span className="px-3 py-2 text-xs text-subtle">Aucun autre code pour l'instant.</span>}
              </div>
              <span className="text-[0.6875rem] leading-relaxed text-subtle">Non coché = ce code ne peut pas être combiné avec l'autre dans un même panier.</span>
            </details>
          </ActionForm>
          {current && !isNew && (
            <ActionForm action={deletePromoAction} submitLabel="Supprimer" submitTone="ghost" confirm={`Supprimer le code ${current.code} ?`} className="!gap-0 border-t border-line-soft pt-3 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent">
              <input type="hidden" name="code" value={current.code} />
            </ActionForm>
          )}
          {influencerCodes.length > 0 && (
            <p className="border-t border-line-soft pt-3 text-[0.6875rem] text-subtle">
              Codes influenceurs actifs :{" "}
              {influencerCodes.map((p, i) => (
                <span key={p.code}>
                  {i > 0 && ", "}
                  <Link href={`/admin/influenceurs?id=${p.influencerId}`} className="font-bold underline">
                    {p.code}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function StackOption({ value, label, hint, checked }: { value: string; label: string; hint: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[0.8125rem] font-semibold hover:bg-white">
      <input type="checkbox" name="stackWith" value={value} defaultChecked={checked} className="h-[18px] w-[18px] accent-ink" />
      <span className="flex-1">{label}</span>
      <span className="text-[0.6875rem] font-semibold text-subtle">{hint}</span>
    </label>
  );
}

