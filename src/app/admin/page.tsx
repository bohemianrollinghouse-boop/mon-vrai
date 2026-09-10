import Link from "next/link";
import { Card, GridTable, Pill, Tile } from "@/components/admin/ui";
import { adminSnapshot } from "@/lib/admin/counts";
import { orderRevenue, sumRevenue } from "@/lib/admin/revenue";
import { ADMIN_STATUS_LABELS, COUNTED, STATUS_TONE, TO_SHIP, capitalize, longDate, shortDate } from "@/lib/admin/order-ui";
import { requireAdmin } from "@/lib/auth/session";
import { formatEuro } from "@/lib/domain/money";
import type { Order } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Tableau de bord, d'après la maquette : bonjour + date, période (7 j / 30 j / depuis
 * le début), quatre tuiles, dernières commandes, ventes par titre, liste « à faire ».
 * Les commandes de test et les commandes annulées/remboursées ne comptent pas.
 *
 * La tuile du chiffre d'affaires bascule entre brut (encaissé) et net (ce qu'il reste
 * après cotisations, commission, fabrication, emballage et port réel) : même calcul que
 * /admin/revenus, via lib/admin/revenue.ts. L'état vit dans l'URL (?revenu=net), comme
 * la période — pas de composant client pour deux liens.
 */

const PERIODS = [
  { key: "7", label: "7 jours", days: 7 },
  { key: "30", label: "30 jours", days: 30 },
  { key: "tout", label: "Depuis le début", days: null },
] as const;

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const { periode, revenu } = await searchParams;
  const period = PERIODS.find((p) => p.key === periode) ?? PERIODS[0];
  const netView = revenu === "net";
  const [user, snap] = await Promise.all([requireAdmin(), adminSnapshot()]);
  const { orders, products, settings, now } = snap;

  const counted = (o: Order) => o.livemode && COUNTED.includes(o.status);
  const inRange = (o: Order, from: number, to: number) => o.createdAt >= from && o.createdAt < to;
  const span = period.days ? period.days * 86_400_000 : Infinity;
  const current = orders.filter((o) => counted(o) && (period.days ? inRange(o, now - span, now + 1) : true));
  const previous = period.days ? orders.filter((o) => counted(o) && inRange(o, now - 2 * span, now - span)) : [];

  const revenue = current.reduce((s, o) => s + o.totals.total, 0);
  const prevRevenue = previous.reduce((s, o) => s + o.totals.total, 0);
  const delta = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  const basket = current.length ? Math.round(revenue / current.length) : 0;

  // Revenu net de la période (et de la précédente, pour l'évolution) : mêmes règles que
  // la page Revenus. Un coût unitaire laissé à zéro dans les réglages surévalue le net,
  // ce que la précision de la tuile signale plutôt que de le taire.
  const net = sumRevenue(current.map((o) => orderRevenue(o, settings)));
  const prevNet = sumRevenue(previous.map((o) => orderRevenue(o, settings)));
  const netDelta = prevNet.net > 0 ? Math.round(((net.net - prevNet.net) / prevNet.net) * 100) : null;
  const costsIncomplete = !settings.costs.bookCost || !settings.costs.packagingCost;
  /** Lien vers le tableau de bord en conservant l'autre réglage (période / brut-net). */
  const dash = (p: string, r: boolean) => {
    const q = new URLSearchParams();
    if (p !== "7") q.set("periode", p);
    if (r) q.set("revenu", "net");
    return q.size ? `/admin?${q}` : "/admin";
  };

  const preorderBooks = orders.filter((o) => o.livemode && TO_SHIP.includes(o.status)).reduce((s, o) => s + o.lines.filter((l) => l.preorder).reduce((a, l) => a + l.qty, 0), 0);
  const shipFrom = settings.shipping.preorderShipFrom ? new Date(settings.shipping.preorderShipFrom).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;

  const sold = new Map<string, { title: string; qty: number }>();
  for (const o of current) for (const l of o.lines) sold.set(l.productSlug, { title: l.title, qty: (sold.get(l.productSlug)?.qty ?? 0) + l.qty });
  const top = [...sold.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const max = top[0]?.qty ?? 1;

  const preordersOpen = products.some((p) => p.status === "published" && p.preorder.enabled);
  const firstName = (user.name || user.email.split("@")[0]).split(" ")[0];
  const todo: { text: string; href: string }[] = [];
  if (snap.toShip) todo.push({ text: `${snap.toShip} commande${snap.toShip > 1 ? "s" : ""} à expédier`, href: "/admin/commandes?statut=a-expedier" });
  for (const p of snap.lowStock.slice(0, 2)) todo.push({ text: `Stock « ${p.title} » : ${p.stock} ex. restant${(p.stock ?? 0) > 1 ? "s" : ""}`, href: `/admin/produits/${p.slug}` });
  if (snap.unread) todo.push({ text: `${snap.unread} message${snap.unread > 1 ? "s" : ""} client sans réponse`, href: "/admin/messages" });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.875rem] font-extrabold leading-tight tracking-[-0.02em]">Bonjour {capitalize(firstName)}</h1>
          <span className="text-[0.8125rem] font-semibold text-subtle">
            {capitalize(longDate(now))}
            {preordersOpen && " · précommandes ouvertes"}
          </span>
        </div>
        <nav className="flex gap-1.5 rounded-pill bg-surface p-1.5 text-xs font-bold" aria-label="Période">
          {PERIODS.map((p) => (
            <Link key={p.key} href={dash(p.key, netView)} className={`rounded-pill px-3.5 py-2 ${p.key === period.key ? "bg-ink text-on-ink" : "hover:opacity-70"}`}>
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        {/*
          Pas de `href` sur la tuile : elle porte deux liens (brut / net) et un <a> ne
          s'imbrique pas dans un autre. Le nombre lui-même mène à Revenus — des liens
          frères, donc du HTML valide.
        */}
        <Tile
          tone="green"
          label={
            <span className="flex items-center justify-between gap-2">
              <span>Chiffre d'affaires</span>
              <span className="flex gap-0.5 rounded-pill bg-tint-green-ink/15 p-0.5 text-[0.6875rem] font-bold" role="group" aria-label="Chiffre d'affaires brut ou net">
                {[false, true].map((r) => (
                  <Link key={String(r)} href={dash(period.key, r)} aria-current={r === netView ? "true" : undefined} className={`rounded-pill px-2.5 py-[3px] ${r === netView ? "bg-tint-green-ink text-tint-green" : "hover:opacity-70"}`}>
                    {r ? "Net" : "Brut"}
                  </Link>
                ))}
              </span>
            </span>
          }
          value={
            <Link href="/admin/revenus" className="hover:opacity-70">
              {formatEuro(netView ? net.net : revenue)}
            </Link>
          }
          note={
            netView
              ? costsIncomplete
                ? "coûts unitaires à compléter dans Revenus"
                : netDelta === null
                  ? "après cotisations, coûts et port réel"
                  : `${netDelta >= 0 ? "+" : "−"}${Math.abs(netDelta)} % vs ${period.days} jours précédents`
              : delta === null
                ? period.days
                  ? "pas de période de comparaison"
                  : `${current.length} commandes encaissées`
                : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)} % vs ${period.days} jours précédents`
          }
        />
        <Tile label="Commandes" value={current.length} note={current.length ? `panier moyen ${formatEuro(basket)}` : "aucune sur la période"} href="/admin/commandes" />
        <Tile label="Livres précommandés" value={preorderBooks} note={shipFrom ? `à expédier dès le ${shipFrom}` : "à expédier"} href="/admin/commandes?statut=a-expedier" />
        <Tile tone={snap.lowStock.length ? "pink" : "white"} label="Stock bas" value={`${snap.lowStock.length} titre${snap.lowStock.length > 1 ? "s" : ""}`} note={`sous le seuil de ${settings.inventory.lowThreshold} ex.`} href="/admin/stocks" />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <Card
          title="Dernières commandes"
          aside={
            <Link href="/admin/commandes" className="border-b-[1.5px] border-ink text-xs font-bold">
              Tout voir
            </Link>
          }
          className="!p-6 [&>div:last-child]:-mx-6 [&>div:last-child]:rounded-none [&>div:last-child]:py-0"
        >
          <GridTable
            columns="minmax(110px,auto) 1fr 130px 80px 80px"
            head={["N°", "Client", "Statut", "Date", "Total"]}
            empty="Aucune commande pour le moment."
            rows={orders.slice(0, 5).map((o) => ({
              key: o.id,
              href: `/admin/commandes/${o.id}`,
              cells: [
                <span key="n" className="font-bold">{o.number}</span>,
                <span key="c" className="truncate font-semibold">{o.shippingAddress.name}</span>,
                <span key="s" className="flex gap-1.5">
                  <Pill tone={STATUS_TONE[o.status]}>{ADMIN_STATUS_LABELS[o.status]}</Pill>
                  {!o.livemode && <Pill tone="muted">Test</Pill>}
                </span>,
                <span key="d" className="text-subtle">{shortDate(o.createdAt)}</span>,
                <span key="t" className="font-extrabold whitespace-nowrap">{formatEuro(o.totals.total)}</span>,
              ],
            }))}
          />
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Ventes par titre">
            {top.length === 0 ? (
              <p className="text-[0.8125rem] text-muted">Aucune vente sur la période.</p>
            ) : (
              top.map((t) => (
                <div key={t.title} className="flex flex-col gap-1.5 text-[0.8125rem]">
                  <div className="flex justify-between gap-3">
                    <span className="truncate font-semibold">{t.title}</span>
                    <span className="font-bold">{t.qty}</span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-paper">
                    <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.round((t.qty / max) * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </Card>
          <Card tone="sand" title={<span className="text-sm text-ink">À faire</span>} className="!gap-2 !py-5">
            {todo.length === 0 ? (
              <span className="text-[0.8125rem] font-semibold">Rien d'urgent. Tout est à jour.</span>
            ) : (
              todo.map((t) => (
                <Link key={t.text} href={t.href} className="text-[0.8125rem] font-semibold hover:underline">
                  · {t.text}
                </Link>
              ))
            )}
          </Card>
        </div>
      </div>

      <Card title="Liens utiles" className="mt-3">
        <div className="grid grid-cols-4 gap-2.5 max-[899px]:grid-cols-2">
          {SERVICE_LINKS.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-[14px] bg-paper px-4 py-3.5 text-[0.8125rem] font-bold hover:opacity-70">
              <span className="flex flex-col">
                <span>{s.label}</span>
                <span className="text-[0.6875rem] font-medium text-subtle">{s.note}</span>
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}

/** Tableaux de bord des services externes utilisés par la boutique. */
const SERVICE_LINKS = [
  { label: "Boxtal", note: "Expéditions, étiquettes", href: "https://shipping.boxtal.com/fr/fr/accueil" },
  { label: "Resend", note: "E-mails envoyés", href: "https://resend.com/overview" },
  { label: "Firebase", note: "Hébergement, base de données", href: "https://console.firebase.google.com/project/mon-vrai/overview" },
  { label: "Tiime", note: "Facturation, comptabilité", href: "https://apps.tiime.fr/companies/459759" },
];
