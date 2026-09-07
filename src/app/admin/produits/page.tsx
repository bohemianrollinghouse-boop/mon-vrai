import { ButtonLink, FilterPills, GridTable, PageHeader, Pill, SearchBox, Thumb } from "@/components/admin/ui";
import { adminSnapshot, lowStockProducts } from "@/lib/admin/counts";
import { COUNTED } from "@/lib/admin/order-ui";
import { formatEuro } from "@/lib/domain/money";
import type { Product } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const BADGE = { none: "—", new: "Nouveauté", reissue: "Nouvelle édition" } as const;

const FILTERS: { key: string; label: string; test: (p: Product, low: Set<string>) => boolean }[] = [
  { key: "en-ligne", label: "En ligne", test: (p) => p.status === "published" },
  { key: "brouillons", label: "Brouillon", test: (p) => p.status === "draft" },
  { key: "precommande", label: "Précommande", test: (p) => p.preorder.enabled },
  { key: "stock-bas", label: "Stock bas", test: (p, low) => low.has(p.slug) },
];

export default async function ProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  const sp = await searchParams;
  const filtre = typeof sp.filtre === "string" ? sp.filtre : "";
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const snap = await adminSnapshot();
  const low = new Set(lowStockProducts(snap.products, snap.settings).map((p) => p.slug));
  const filter = FILTERS.find((f) => f.key === filtre);

  const sold = new Map<string, number>();
  for (const o of snap.orders) if (o.livemode && COUNTED.includes(o.status)) for (const l of o.lines) sold.set(l.productSlug, (sold.get(l.productSlug) ?? 0) + l.qty);

  const matches = (p: Product) => !q || p.title.toLowerCase().includes(q) || p.slug.includes(q) || (p.isbn ?? "").includes(q);
  const products = snap.products.filter((p) => matches(p) && (!filter || filter.test(p, low)));
  const href = (key: string) => `/admin/produits${key || q ? "?" : ""}${[key && `filtre=${key}`, q && `q=${encodeURIComponent(q)}`].filter(Boolean).join("&")}`;

  return (
    <>
      <PageHeader
        title="Produits"
        actions={
          <>
            <SearchBox action="/admin/produits" defaultValue={q} placeholder="Rechercher un titre, une adresse…" hidden={filtre ? { filtre } : {}} />
            <ButtonLink href="/admin/produits/nouveau" tone="primary">
              + Nouveau produit
            </ButtonLink>
          </>
        }
      />
      <FilterPills
        items={[
          { href: href(""), label: "Tous", count: snap.products.filter(matches).length, active: !filter },
          ...FILTERS.map((f) => ({ href: href(f.key), label: f.label, count: snap.products.filter((p) => matches(p) && f.test(p, low)).length, active: filter?.key === f.key })),
        ]}
      />
      <GridTable
        columns="56px 1.2fr 1fr 130px 80px 100px 110px"
        head={["", "Produit", "Adresse", "Pastille", "Prix", "Stock", "Statut"]}
        empty="Aucun produit ne correspond."
        rows={products.map((p) => ({
          key: p.slug,
          href: `/admin/produits/${p.slug}`,
          cells: [
            <Thumb key="i" src={p.images[0]?.url} tint={p.tint} />,
            <span key="t" className="flex flex-col">
              <span className="truncate font-bold">{p.title}</span>
              <span className="text-[0.6875rem] text-subtle">
                {sold.get(p.slug) ?? 0} vendu{(sold.get(p.slug) ?? 0) > 1 ? "s" : ""}
                {p.preorder.enabled && " · précommande"}
              </span>
            </span>,
            <span key="s" className="truncate text-xs font-semibold text-muted" title={`/livres/${p.slug}`}>{p.slug}</span>,
            <span key="b" className="text-muted">{BADGE[p.badge]}</span>,
            <span key="p" className="font-bold">{formatEuro(p.price)}</span>,
            <span key="k">{p.stock === null ? <Pill tone="muted">non suivi</Pill> : <Pill tone={low.has(p.slug) ? "pink" : "ok"}>{p.stock}</Pill>}</span>,
            <span key="st" className="flex justify-end">
              <Pill tone={p.status === "published" ? "ok" : "muted"}>{p.status === "published" ? "En ligne" : "Brouillon"}</Pill>
            </span>,
          ],
        }))}
      />
    </>
  );
}
