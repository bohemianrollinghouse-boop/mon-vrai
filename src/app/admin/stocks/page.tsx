import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, GridTable, Input, Notice, PageHeader, Pill, Select, Thumb } from "@/components/admin/ui";
import { adjustInfluenceStockAction, adjustStockAction } from "@/lib/admin/actions/stock";
import { adminSnapshot, lowStockProducts, reservedBySlug } from "@/lib/admin/counts";
import { influenceRows, shortTitles } from "@/lib/admin/influence-stock";
import { listAllCampaigns } from "@/lib/db/campaigns";
import { listContests } from "@/lib/db/contests";

export const dynamic = "force-dynamic";

/*
 * Stocks, d'après la maquette : physique − réservé = disponible. Chez nous le stock
 * est décrémenté au paiement, donc « disponible » est le stock enregistré et
 * « réservé » les exemplaires payés pas encore expédiés ; « physique » les additionne :
 * c'est ce qu'il doit y avoir sur l'étagère.
 *
 * Deux stocks, deux tableaux. Celui de la VENTE, et celui de l'INFLUENCE — les
 * exemplaires mis de côté pour les partenaires et les jeux, qui ne sont pas à vendre et
 * dont il n'est question nulle part sur la boutique. Les mélanger reviendrait à vendre
 * un livre promis, ou à croire en stock ce qui est déjà parti en kit.
 */
export default async function StocksPage() {
  const [snap, campaigns, contests] = await Promise.all([adminSnapshot(), listAllCampaigns(), listContests()]);
  const reserved = reservedBySlug(snap.orders.filter((o) => o.livemode));
  const low = new Set(lowStockProducts(snap.products, snap.settings).map((p) => p.slug));
  const tracked = snap.products.filter((p) => p.stock !== null);
  const untracked = snap.products.filter((p) => p.stock === null);

  /* Le stock influence : ce qui reste, ce qui est promis, ce qu'on peut encore promettre. */
  const influence = influenceRows(snap.products, campaigns, contests, snap.now);
  const short = shortTitles(influence);
  const byTitle = new Map(snap.products.map((p) => [p.slug, p]));

  return (
    <>
      <PageHeader title="Stocks" subtitle={`Stock physique − réservé (payé, pas encore expédié) = disponible · seuil d'alerte ${snap.settings.inventory.lowThreshold} ex.`} />

      <div className="grid grid-cols-[1fr_340px] items-start gap-3 max-[1099px]:grid-cols-1">
        <GridTable
          columns="56px 1fr 110px 110px 120px 150px"
          head={["", "Produit", "Physique", "Réservé", "Disponible", "Ajuster"]}
          empty="Aucun titre avec stock suivi. Enregistrez une réception à droite : le suivi démarre pour ce titre."
          rows={[...tracked, ...untracked].map((p) => {
            const r = reserved.get(p.slug) ?? 0;
            const stock = p.stock ?? 0;
            const untrackedRow = p.stock === null;
            return {
              key: p.slug,
              cells: [
                <Thumb key="i" src={p.images[0]?.url} tint={p.tint} />,
                <span key="t" className="flex flex-col">
                  <Link href={`/admin/produits/${p.slug}`} className="truncate font-bold hover:underline">
                    {p.title}
                  </Link>
                  <span className="text-[0.6875rem] text-subtle">{p.status === "published" ? "en ligne" : "brouillon"}{p.preorder.enabled && " · précommande"}</span>
                </span>,
                <span key="p" className="font-bold">{untrackedRow ? "-" : stock + r}</span>,
                <span key="r" className="text-muted">{r}</span>,
                <span key="d">{untrackedRow ? <Pill tone="muted">non suivi</Pill> : <Pill tone={low.has(p.slug) ? "pink" : "ok"}>{stock}</Pill>}</span>,
                <span key="a" className="flex justify-end">
                  <span className="flex items-center gap-1 rounded-pill bg-paper p-[3px]">
                    <ActionForm action={adjustStockAction} submitLabel="−" submitTone="secondary" className="!gap-0 [&>div:last-child]:contents [&_button]:h-[30px] [&_button]:w-[30px] [&_button]:!px-0">
                      <input type="hidden" name="slug" value={p.slug} />
                      <input type="hidden" name="delta" value="-1" />
                    </ActionForm>
                    <span className="w-8 text-center text-xs font-bold">±1</span>
                    <ActionForm action={adjustStockAction} submitLabel="+" submitTone="secondary" className="!gap-0 [&>div:last-child]:contents [&_button]:h-[30px] [&_button]:w-[30px] [&_button]:!px-0">
                      <input type="hidden" name="slug" value={p.slug} />
                      <input type="hidden" name="delta" value="1" />
                    </ActionForm>
                  </span>
                </span>,
              ],
            };
          })}
        />

        <Card title="Réception de stock">
          <p className="text-[0.8125rem] text-muted">Vous recevez un carton : ajoutez d'un coup les exemplaires à un titre. Sur un titre « non suivi », le suivi démarre à partir de ce nombre.</p>
          <ActionForm action={adjustStockAction} submitLabel="Ajouter au stock">
            <Field label="Titre" name="slug">
              <Select name="slug" defaultValue={snap.products[0]?.slug}>
                {snap.products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                    {p.stock === null ? " (non suivi)" : ` (${p.stock})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exemplaires reçus" hint="Un nombre négatif retire (casse, perte)." name="delta">
              <Input name="delta" type="number" defaultValue={50} min={-1000} max={1000} required />
            </Field>
          </ActionForm>
          {untracked.length > 0 && (
            <p className="border-t border-line-soft pt-3 text-xs text-subtle">
              Sans suivi ({untracked.length}) : ces titres se vendent sans limite. Le « + » de leur ligne ou une réception démarre le suivi.
            </p>
          )}
        </Card>
      </div>

      {/* ---------- Le stock mis de côté pour l'influence ---------- */}
      <div className="flex flex-col gap-1 pt-4">
        <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">Stock influence</h2>
        <p className="text-[0.8125rem] leading-relaxed text-subtle">
          Les exemplaires réservés aux partenaires et aux jeux : ils ne sont pas à vendre et n&apos;apparaissent nulle
          part sur la boutique. <strong className="text-ink">Stock</strong> : ce qui reste, à vous de l&apos;augmenter
          quand un carton arrive. <strong className="text-ink">Disponible</strong> : ce que vous pouvez encore
          promettre — une campagne montée ou un concours ouvert retient déjà ses exemplaires, et le stock baisse
          ensuite tout seul quand le kit ou le lot est commandé.
        </p>
      </div>

      {short.length > 0 && (
        <Notice tone="error">
          Promis plus que disponible sur {short.length} titre{short.length > 1 ? "s" : ""} :{" "}
          {short.map((r) => `${r.title} (${r.available})`).join(", ")}. Recevez un carton, ou réduisez ce qui est réservé.
        </Notice>
      )}

      <div className="grid grid-cols-[1fr_340px] items-start gap-3 max-[1099px]:grid-cols-1">
        <GridTable
          columns="56px 1fr 120px 130px 150px"
          head={["", "Produit", "Stock", "Disponible", "Ajuster"]}
          empty="Aucun titre au catalogue."
          rows={influence.map((r) => {
            const p = byTitle.get(r.slug);
            return {
              key: r.slug,
              cells: [
                <Thumb key="i" src={p?.images[0]?.url} tint={p?.tint ?? "green"} />,
                <span key="t" className="flex flex-col">
                  <Link href={`/admin/produits/${r.slug}`} className="truncate font-bold hover:underline">
                    {r.title}
                  </Link>
                  {/* L'écart entre les deux nombres se dit ici, en petit : sans cela, un
                      disponible plus bas que le stock resterait sans explication. */}
                  {r.reserved > 0 && (
                    <span className={`text-[0.6875rem] ${r.available < 0 ? "font-semibold text-accent" : "text-subtle"}`}>
                      {r.reserved} promis par une campagne ou un concours
                      {r.available < 0 && ` · ${-r.available} de trop`}
                    </span>
                  )}
                </span>,
                <span key="s" className="font-bold">{r.stock}</span>,
                <span key="d">
                  <Pill tone={r.available < 0 ? "pink" : r.available === 0 ? "muted" : "ok"}>{r.available}</Pill>
                </span>,
                <span key="a" className="flex justify-end">
                  <span className="flex items-center gap-1 rounded-pill bg-paper p-[3px]">
                    <ActionForm action={adjustInfluenceStockAction} submitLabel="−" submitTone="secondary" className="!gap-0 [&>div:last-child]:contents [&_button]:h-[30px] [&_button]:w-[30px] [&_button]:!px-0">
                      <input type="hidden" name="slug" value={r.slug} />
                      <input type="hidden" name="delta" value="-1" />
                    </ActionForm>
                    <span className="w-8 text-center text-xs font-bold">±1</span>
                    <ActionForm action={adjustInfluenceStockAction} submitLabel="+" submitTone="secondary" className="!gap-0 [&>div:last-child]:contents [&_button]:h-[30px] [&_button]:w-[30px] [&_button]:!px-0">
                      <input type="hidden" name="slug" value={r.slug} />
                      <input type="hidden" name="delta" value="1" />
                    </ActionForm>
                  </span>
                </span>,
              ],
            };
          })}
        />

        <Card title="Réception influence" tone="sand">
          <p className="text-[0.8125rem]">
            Vous mettez des exemplaires de côté pour les partenaires et les jeux : ajoutez-les ici. Ils quittent le
            stock de vente s&apos;ils en venaient — retirez-les là-haut d&apos;autant.
          </p>
          <ActionForm action={adjustInfluenceStockAction} submitLabel="Ajouter au stock influence">
            <Field label="Titre" name="slug">
              <Select name="slug" defaultValue={snap.products[0]?.slug}>
                {snap.products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title} ({p.influenceStock})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exemplaires mis de côté" hint="Un nombre négatif retire (casse, perte, retour à la vente)." name="delta">
              <Input name="delta" type="number" defaultValue={10} min={-1000} max={1000} required />
            </Field>
          </ActionForm>
          <p className="border-t border-line-soft pt-3 text-xs">
            Une campagne ou un concours peut aussi puiser dans le stock de vente : la case « Décompter du stock de
            vente » de son kit ou de son lot. Ce qui y est réglé ne compte pas ici.
          </p>
        </Card>
      </div>
    </>
  );
}
