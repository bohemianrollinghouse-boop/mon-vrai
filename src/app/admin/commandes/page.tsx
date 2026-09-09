import { ButtonLink, FilterPills, GridTable, PageHeader, Pill, SearchBox } from "@/components/admin/ui";
import { ADMIN_STATUS_LABELS, ORDER_FILTERS, STATUS_TONE, itemsSummary, matchesQuery, shortDate } from "@/lib/admin/order-ui";
import { listOrders } from "@/lib/db/orders";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  const sp = await searchParams;
  const statut = typeof sp.statut === "string" ? sp.statut : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const all = await listOrders({ limit: 500 });
  const filter = ORDER_FILTERS.find((f) => f.key === statut);
  const orders = all.filter((o) => (!filter || filter.statuses.includes(o.status)) && matchesQuery(o, q));

  const href = (key: string) => `/admin/commandes${key || q ? "?" : ""}${[key && `statut=${key}`, q && `q=${encodeURIComponent(q)}`].filter(Boolean).join("&")}`;
  const exportHref = `/admin/commandes/export${statut || q ? "?" : ""}${[statut && `statut=${statut}`, q && `q=${encodeURIComponent(q)}`].filter(Boolean).join("&")}`;

  return (
    <>
      <PageHeader
        title="Commandes"
        actions={
          <>
            <SearchBox action="/admin/commandes" defaultValue={q} placeholder="Rechercher n°, client, e-mail…" hidden={statut ? { statut } : {}} />
            <ButtonLink href={exportHref} tone="secondary">
              Exporter CSV
            </ButtonLink>
          </>
        }
      />
      <FilterPills
        items={[
          { href: href(""), label: "Toutes", count: all.filter((o) => matchesQuery(o, q)).length, active: !filter },
          ...ORDER_FILTERS.map((f) => ({ href: href(f.key), label: f.label, count: all.filter((o) => f.statuses.includes(o.status) && matchesQuery(o, q)).length, active: filter?.key === f.key })),
        ]}
      />
      <GridTable
        columns="minmax(120px,auto) 1fr 1fr 150px 130px 80px 90px"
        head={["N°", "Client", "Articles", "Statut", "Livraison", "Date", "Total"]}
        empty={q ? `Aucune commande pour « ${q} ».` : "Aucune commande."}
        rows={orders.map((o) => ({
          key: o.id,
          href: `/admin/commandes/${o.id}`,
          cells: [
            <span key="n" className="font-bold">{o.number}</span>,
            <span key="c" className="flex flex-col">
              <span className="truncate font-semibold">{o.shippingAddress.name}</span>
              <span className="truncate text-[0.6875rem] text-subtle">{o.shippingAddress.city}</span>
            </span>,
            <span key="a" className="truncate text-muted">{itemsSummary(o)}</span>,
            <span key="s" className="flex flex-wrap gap-1.5">
              <Pill tone={STATUS_TONE[o.status]}>{ADMIN_STATUS_LABELS[o.status]}</Pill>
              {!o.livemode && <Pill tone="muted">Test</Pill>}
            </span>,
            <span key="l" className="truncate font-semibold text-muted">{o.tracking?.carrier ?? "-"}</span>,
            <span key="d" className="text-subtle">{shortDate(o.createdAt)}</span>,
            <span key="t" className="font-extrabold whitespace-nowrap">{formatEuro(o.totals.total)}</span>,
          ],
        }))}
      />
    </>
  );
}
