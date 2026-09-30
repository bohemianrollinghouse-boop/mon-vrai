import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, GridTable, Input, Notice, PageHeader, Pill, Select, Thumb } from "@/components/admin/ui";
import { adjustInfluenceStockAction, adjustStockAction, setInfluenceStockAction } from "@/lib/admin/actions/stock";
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
 *
 * Les deux ne se tiennent pas de la même façon, et c'est voulu. Le stock de vente est un
 * compteur : il baisse au paiement. Le stock influence est une DÉCLARATION — ce qu'on a
 * mis de côté —, de laquelle on retranche ce que les commandes ont emporté. Un compteur
 * qui baisserait tout seul ici aurait ignoré tous les kits partis avant son existence ;
 * une soustraction, elle, les retrouve (voir lib/admin/influence-stock.ts).
 */
export default async function StocksPage() {
  const [snap, campaigns, contests] = await Promise.all([adminSnapshot(), listAllCampaigns(), listContests()]);
  const reserved = reservedBySlug(snap.orders.filter((o) => o.livemode));
  const low = new Set(lowStockProducts(snap.products, snap.settings).map((p) => p.slug));
  const tracked = snap.products.filter((p) => p.stock !== null);
  const untracked = snap.products.filter((p) => p.stock === null);

  /* Le stock influence : ce qu'on a mis de côté, ce qui est parti, ce qui reste. */
  const influence = influenceRows(snap.products, snap.orders.filter((o) => o.livemode), campaigns, contests, snap.now);
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
          Les exemplaires mis de côté pour les partenaires et les jeux : ils ne sont pas à vendre et n&apos;apparaissent
          nulle part sur la boutique. <strong className="text-ink">Stock</strong> : ce que vous avez mis de côté — c&apos;est
          votre nombre, il ne bouge que si vous le changez. <strong className="text-ink">Envoyé</strong> : ce que les
          kits et les lots ont emporté, compté sur les commandes elles-mêmes — les envois d&apos;avant cet écran
          compris. <strong className="text-ink">Disponible</strong> : ce qui reste, soit stock − envoyé.
        </p>
        <p className="text-[0.8125rem] leading-relaxed text-subtle">
          Une campagne montée ou un concours ouvert retient en plus ses exemplaires tant que personne n&apos;a commandé :
          ils ne sont plus disponibles sans être partis pour autant, et la ligne sous le titre le dit. Pour corriger,
          tapez dans la colonne Stock le nombre que vous avez compté sur l&apos;étagère, puis OK.
        </p>
      </div>

      {short.length > 0 && (
        <Notice tone="error">
          Promis plus que disponible sur {short.length} titre{short.length > 1 ? "s" : ""} :{" "}
          {short.map((r) => `${r.title} (${r.available})`).join(", ")}. Mettez-en davantage de côté, ou réduisez ce qui est promis.
        </Notice>
      )}

      <div className="grid grid-cols-[1fr_340px] items-start gap-3 max-[1099px]:grid-cols-1">
        <GridTable
          columns="56px 1fr 160px 110px 120px"
          head={["", "Produit", "Stock", "Envoyé", "Disponible"]}
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
                  {/* Ce qui est retenu sans être parti : sans cette ligne, un disponible
                      plus bas que stock − envoyé resterait sans explication. */}
                  {(r.reserved > 0 || r.available < 0) && (
                    <span className={`text-[0.6875rem] ${r.available < 0 ? "font-semibold text-accent" : "text-subtle"}`}>
                      {[
                        r.reserved > 0 ? `${r.reserved} promis par une campagne ou un concours` : "",
                        r.available < 0 ? `${-r.available} de trop : mettez-en de côté` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>,
                /*
                 * Le stock se corrige en le RÉÉCRIVANT : il ne baisse pas tout seul, donc
                 * le corriger c'est dire combien il y en a — pas de combien il a bougé.
                 * Le champ porte le nombre du jour ; on le remplace et on enregistre.
                 */
                <ActionForm
                  key="s"
                  action={setInfluenceStockAction}
                  submitLabel="OK"
                  submitTone="secondary"
                  className="!gap-0 [&>div:last-child]:contents [&_button]:h-[34px] [&_button]:!px-3 [&_button]:text-xs"
                >
                  <input type="hidden" name="slug" value={r.slug} />
                  <span className="flex items-center gap-1">
                    <input
                      name="stock"
                      type="number"
                      min={0}
                      max={100000}
                      defaultValue={r.stock}
                      aria-label={`Stock influence · ${r.title}`}
                      className="w-[72px] rounded-xl bg-paper px-3 py-2 text-sm font-extrabold outline-none focus-visible:outline-2 focus-visible:outline-ink"
                    />
                  </span>
                </ActionForm>,
                <span key="e" className="text-muted">{r.sent > 0 ? r.sent : <span className="text-faint">—</span>}</span>,
                <span key="d">
                  <Pill tone={r.available < 0 ? "pink" : r.available === 0 ? "muted" : "ok"}>{r.available}</Pill>
                </span>,
              ],
            };
          })}
        />

        <Card title="Réception influence" tone="sand">
          <p className="text-[0.8125rem]">
            Vous mettez un carton de plus de côté : ajoutez-le ici, il s&apos;additionne au stock du titre. Pour
            remplacer le nombre plutôt que l&apos;augmenter, écrivez-le directement dans la colonne Stock. Ces
            exemplaires quittent le stock de vente s&apos;ils en venaient — retirez-les là-haut d&apos;autant.
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
