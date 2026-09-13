import { ButtonLink, FilterPills, GridTable, PageHeader, Pill, SearchBox } from "@/components/admin/ui";
import { ADMIN_STATUS_LABELS, ORDER_FILTERS, STATUS_TONE, bookCount, itemsSummary, matchesQuery, shortDate } from "@/lib/admin/order-ui";
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
        columns="minmax(120px,auto) 1fr 1.3fr 150px 130px 80px 90px"
        head={["N°", "Client", "Livres", "Statut", "Livraison", "Date", "Total"]}
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
            /* Combien de livres d'abord, le détail ensuite, et le code promo s'il y en a eu. */
            (() => {
              const books = bookCount(o);
              return (
                <span key="a" className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">
                    <span className="font-bold">
                      {books.total} livre{books.total > 1 ? "s" : ""}
                    </span>
                    <span className="text-muted"> · {itemsSummary(o)}</span>
                  </span>
                  {(o.totals.discount > 0 || books.gifted > 0) && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {o.promoCodes.map((code) => (
                        <span key={code} className="rounded-lg bg-paper px-2 py-[3px] text-[0.625rem] font-bold">
                          {code}
                        </span>
                      ))}
                      {/* Une remise sans code ne peut venir que de l'offre collection,
                          qui s'applique toute seule (voir checkout/quote.ts). */}
                      {o.promoCodes.length === 0 && o.totals.discount > 0 && (
                        <span className="rounded-lg bg-paper px-2 py-[3px] text-[0.625rem] font-bold text-subtle">offre collection</span>
                      )}
                      {o.totals.discount > 0 && <span className="text-[0.625rem] font-bold text-accent">− {formatEuro(o.totals.discount)}</span>}
                      {books.gifted > 0 && !o.kit && (
                        <span className="text-[0.625rem] font-semibold text-subtle">
                          {books.gifted} offert{books.gifted > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              );
            })(),
            <span key="s" className="flex flex-wrap gap-1.5">
              <Pill tone={STATUS_TONE[o.status]}>{ADMIN_STATUS_LABELS[o.status]}</Pill>
              {!o.livemode && <Pill tone="muted">Test</Pill>}
              {o.kit && <Pill tone="ok">Kit</Pill>}
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
