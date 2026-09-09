import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Field, GridTable, Input, PageHeader, Pill, Select, Thumb } from "@/components/admin/ui";
import { adjustStockAction } from "@/lib/admin/actions/stock";
import { adminSnapshot, lowStockProducts, reservedBySlug } from "@/lib/admin/counts";

export const dynamic = "force-dynamic";

/*
 * Stocks, d'après la maquette : physique − réservé = disponible. Chez nous le stock
 * est décrémenté au paiement, donc « disponible » est le stock enregistré et
 * « réservé » les exemplaires payés pas encore expédiés ; « physique » les additionne :
 * c'est ce qu'il doit y avoir sur l'étagère.
 */
export default async function StocksPage() {
  const snap = await adminSnapshot();
  const reserved = reservedBySlug(snap.orders.filter((o) => o.livemode));
  const low = new Set(lowStockProducts(snap.products, snap.settings).map((p) => p.slug));
  const tracked = snap.products.filter((p) => p.stock !== null);
  const untracked = snap.products.filter((p) => p.stock === null);

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
    </>
  );
}
