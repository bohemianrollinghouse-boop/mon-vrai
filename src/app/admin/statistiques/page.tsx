import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { Card, Tile } from "@/components/admin/ui";
import { COUNTED } from "@/lib/admin/order-ui";
import { requireAdmin } from "@/lib/auth/session";
import { now as clock } from "@/lib/db/helpers";
import { listOrders } from "@/lib/db/orders";
import { readDays, readPresence, type DayStats, type Present } from "@/lib/db/stats";
import { formatEuro } from "@/lib/domain/money";
import { DIRECT, OTHER_PAGE, dayKey, hourKey, lastDays, sourceMeta, type DeviceKind } from "@/lib/stats/keys";

export const dynamic = "force-dynamic";

/*
 * Statistiques, d'après la maquette « Mon Vrai - Admin » (vue Statistiques) : cinq tuiles
 * (en ligne, visiteurs uniques, pages vues, taux de conversion, panier moyen), visites par
 * jour, visites par page, sources de trafic, appareils, parcours d'achat, présence en
 * direct. Données maison (lib/stats), sans cookie : les visiteurs uniques sont comptés par
 * jour (empreinte du jour) et additionnés sur la période. Rafraîchissement automatique.
 */

const PERIODS = [
  { key: "7", label: "7 jours", days: 7 },
  { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "90 jours", days: 90 },
] as const;

const PAGE_LABELS: Record<string, string> = {
  "/": "Accueil",
  "/catalogue": "Catalogue",
  "/recherche": "Recherche",
  "/panier": "Panier",
  "/commande": "Paiement",
  "/commande/merci": "Merci (après paiement)",
  "/compte": "Mon compte",
  "/compte/connexion": "Connexion",
  "/compte/commandes": "Détail d'une commande",
  "/contact": "Contact",
  "/informations": "Informations",
  "/notre-histoire": "Notre histoire",
  [OTHER_PAGE]: "Autres / introuvables",
};
const DEVICE_LABELS: Record<DeviceKind, string> = { mobile: "Mobile", ordinateur: "Ordinateur", tablette: "Tablette" };
const DEVICE_BG: Record<DeviceKind, string> = { mobile: "bg-ink", ordinateur: "bg-tint-green", tablette: "bg-tint-sand" };
const TONE = {
  pink: { badge: "bg-tint-pink text-tint-pink-ink", bar: "bg-tint-pink" },
  blue: { badge: "bg-tint-blue text-tint-blue-ink", bar: "bg-tint-blue" },
  dark: { badge: "bg-ink text-white", bar: "bg-ink" },
  sand: { badge: "bg-tint-sand text-tint-sand-ink", bar: "bg-tint-sand" },
  green: { badge: "bg-tint-green text-tint-green-ink", bar: "bg-tint-green" },
  paper: { badge: "bg-line-soft text-ink", bar: "bg-ink" },
} as const;

const fmt = (n: number) => n.toLocaleString("fr-FR");
const pct = (n: number, total: number, digits = 0) => (total ? `${((n / total) * 100).toFixed(digits).replace(".", ",")} %` : "–");
const dec = (n: number) => n.toFixed(1).replace(".", ",");
const humanize = (path: string) => (path.startsWith("/livres/") ? titleFromSlug(path.slice(8)) : path.startsWith("/pages/") ? titleFromSlug(path.slice(7)) : path.startsWith("/informations/") ? titleFromSlug(path.slice(14)) : PAGE_LABELS[path] ?? path);
const titleFromSlug = (slug: string) => slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function sum(maps: Record<string, number>[]): [string, number][] {
  const out = new Map<string, number>();
  for (const m of maps) for (const [k, v] of Object.entries(m)) out.set(k, (out.get(k) ?? 0) + v);
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

/** Barres du graphe : une par jour jusqu'à 30 jours, une par semaine au-delà. */
function bars(keys: string[], byDay: Map<string, DayStats>, ordersByDay: Map<string, number>) {
  const daily = keys.map((k) => ({ key: k, visitors: byDay.get(k)?.visitors ?? 0, orders: ordersByDay.get(k) ?? 0, from: k, to: k }));
  if (keys.length <= 30) return daily;
  const weeks: typeof daily = [];
  for (let end = daily.length; end > 0; end -= 7) {
    const chunk = daily.slice(Math.max(0, end - 7), end);
    weeks.unshift({ key: chunk[0].key, visitors: chunk.reduce((s, d) => s + d.visitors, 0), orders: chunk.reduce((s, d) => s + d.orders, 0), from: chunk[0].key, to: chunk[chunk.length - 1].key });
  }
  return weeks;
}
const shortDay = (key: string, opts: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00`).toLocaleDateString("fr-FR", opts);

export default async function StatsPage({ searchParams }: PageProps<"/admin/statistiques">) {
  await requireAdmin();
  const { periode } = await searchParams;
  const period = PERIODS.find((p) => p.key === periode) ?? PERIODS[0];
  const now = clock();
  const keys = lastDays(now, period.days);
  const prevKeys = lastDays(now - period.days * 86_400_000, period.days).filter((k) => !keys.includes(k));
  const [days, prevDays, present, allOrders] = await Promise.all([readDays(keys), readDays(prevKeys), readPresence(), listOrders({ limit: 2000 })]);
  const byDay = new Map(days.map((d) => [d.day, d]));

  // Commandes réelles encaissées sur la période (mêmes règles que le tableau de bord).
  const since = new Date(`${keys[0]}T00:00:00`).getTime() - 3_600_000 * 2;
  const orders = allOrders.filter((o) => o.livemode && COUNTED.includes(o.status) && o.createdAt >= since && dayKey(o.createdAt) >= keys[0]);
  const ordersByDay = new Map<string, number>();
  for (const o of orders) ordersByDay.set(dayKey(o.createdAt), (ordersByDay.get(dayKey(o.createdAt)) ?? 0) + 1);

  const views = days.reduce((s, d) => s + d.views, 0);
  const visitors = days.reduce((s, d) => s + d.visitors, 0);
  const prevVisitors = prevDays.reduce((s, d) => s + d.visitors, 0);
  const delta = prevVisitors ? Math.round(((visitors - prevVisitors) / prevVisitors) * 100) : null;
  const revenue = orders.reduce((s, o) => s + o.totals.total, 0);
  const books = orders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.qty, 0), 0);

  const pages = sum(days.map((d) => d.pages));
  const pageVisitors = new Map(sum(days.map((d) => d.pageVisitors)));
  const maxPage = pages[0]?.[1] ?? 1;
  // Sources regroupées par nom affiché (google.com et google.fr = « Google »).
  const sourceKeys = sum(days.map((d) => d.sources));
  const grouped = new Map<string, { key: string; n: number }>();
  for (const [key, n] of sourceKeys) {
    const name = sourceMeta(key).name;
    const g = grouped.get(name);
    if (g) g.n += n;
    else grouped.set(name, { key, n });
  }
  const sources: [string, number][] = [...grouped.values()].sort((a, b) => b.n - a.n).map((g) => [g.key, g.n]);
  const entries = sources.reduce((s, [, n]) => s + n, 0);
  const maxSource = sources[0]?.[1] ?? 1;
  const devices = sum(days.map((d) => d.devices));
  const deviceTotal = devices.reduce((s, [, n]) => s + n, 0);

  const funnel = [
    { name: "Visiteurs", n: visitors, cls: "bg-ink" },
    { name: "Page produit", n: days.reduce((s, d) => s + d.productVisitors, 0), cls: "bg-tint-blue-ink" },
    { name: "Ajout au panier", n: days.reduce((s, d) => s + d.cartVisitors, 0), cls: "bg-tint-sand-ink" },
    { name: "Paiement", n: days.reduce((s, d) => s + d.checkoutVisitors, 0), cls: "bg-tint-green-ink" },
    { name: "Commande", n: orders.length, cls: "bg-tint-green" },
  ];

  const liveByPath = new Map<string, number>();
  for (const p of present) liveByPath.set(p.path, (liveByPath.get(p.path) ?? 0) + 1);
  const onMobile = present.filter((p) => p.device === "mobile").length;
  const buying = present.filter((p) => p.path === "/panier" || p.path === "/commande").length;
  const liveSources: Record<string, number> = {};
  for (const p of present) if (p.source) liveSources[p.source] = (liveSources[p.source] ?? 0) + 1;
  const topSource = sum([liveSources])[0];
  const today = byDay.get(dayKey(now));
  const h = Number(hourKey(now));
  const cartsLastHour = (today?.cartHours[hourKey(now)] ?? 0) + (today?.cartHours[String(h - 1).padStart(2, "0")] ?? 0);

  const chart = bars(keys, byDay, ordersByDay);
  const chartMax = Math.max(1, ...chart.map((b) => Math.max(b.visitors, b.orders * 10)));
  const weekly = keys.length > 30;

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.875rem] font-extrabold leading-tight tracking-[-0.02em]">Statistiques</h1>
          <span className="text-[0.8125rem] font-semibold text-subtle">Audience du site · données anonymisées, sans cookie</span>
        </div>
        <nav className="flex gap-1.5" aria-label="Période">
          {PERIODS.map((p) => (
            <Link key={p.key} href={p.key === "7" ? "/admin/statistiques" : `/admin/statistiques?periode=${p.key}`} className={`rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${p.key === period.key ? "bg-ink text-white" : "bg-white hover:opacity-70"}`}>
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-5 gap-3 max-[1199px]:grid-cols-3 max-[899px]:grid-cols-2">
        <Tile
          tone="dark"
          label={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#7FBF7F] shadow-[0_0_0_4px_rgb(127_191_127/0.25)]" aria-hidden="true" />
              En ligne maintenant
            </span>
          }
          value={present.length}
          note={present.length ? `${onMobile} sur mobile · ${buying} en cours d'achat` : "personne pour l'instant"}
        />
        <Tile tone="green" label="Visiteurs uniques" value={fmt(visitors)} note={delta === null ? "pas de période de comparaison" : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)} % vs période préc.`} />
        <Tile tone="sand" label="Pages vues" value={fmt(views)} note={`${visitors ? dec(views / visitors) : "–"} pages / visite`} />
        <Tile tone="blue" label="Taux de conversion" value={pct(orders.length, visitors, 1)} note={`${orders.length} commande${orders.length > 1 ? "s" : ""}`} />
        <Tile tone="pink" label="Panier moyen" value={orders.length ? formatEuro(Math.round(revenue / orders.length)) : "–"} note={`${orders.length ? dec(books / orders.length) : "–"} livres / commande`} />
      </div>

      <Card
        title="Visites par jour"
        aside={
          <span className="flex gap-4 text-xs font-bold text-subtle">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ink" />Visiteurs</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-tint-green" />Commandes ×10</span>
          </span>
        }
      >
        <div className="grid h-40 items-end gap-1.5" style={{ gridAutoFlow: "column", gridAutoColumns: "minmax(0,1fr)" }}>
          {chart.map((b) => {
            const vh = Math.round((b.visitors / chartMax) * 100);
            const oh = Math.round(((b.orders * 10) / chartMax) * 100);
            const title = weekly ? `Semaine du ${shortDay(b.from, { day: "numeric", month: "short" })} : ${b.visitors} visiteurs · ${b.orders} commandes` : `${shortDay(b.key, { weekday: "long", day: "numeric", month: "long" })} : ${b.visitors} visiteurs · ${b.orders} commandes`;
            const label = weekly ? shortDay(b.from, { day: "2-digit", month: "2-digit" }) : keys.length <= 7 ? shortDay(b.key, { weekday: "short" }).replace(".", "") : shortDay(b.key, { day: "numeric" });
            const inside = vh >= 22;
            return (
              <div key={b.key} title={title} className="flex h-full flex-col justify-end gap-0.5">
                <div className="flex flex-1 items-end gap-0.5">
                  <div className="relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                    {!inside && b.visitors > 0 && <span className={`mb-0.5 text-[10px] font-bold leading-none text-ink ${keys.length > 7 ? "[writing-mode:vertical-rl] rotate-180" : ""}`}>{b.visitors}</span>}
                    <div className="flex w-full items-start justify-center rounded-t bg-ink" style={{ height: `${Math.max(b.visitors > 0 ? 3 : 0, vh)}%` }}>
                      {inside && <span className={`pt-1 text-[10px] font-bold leading-none text-white ${keys.length > 7 ? "[writing-mode:vertical-rl] rotate-180 pt-0 pb-1.5" : ""}`}>{b.visitors}</span>}
                    </div>
                  </div>
                  <div className="flex-1 rounded-t bg-tint-green" style={{ height: `${Math.max(b.orders > 0 ? 3 : 0, oh)}%` }} />
                </div>
                <span className="text-center text-[10px] font-semibold text-faint">{keys.length <= 7 || weekly || Number(label) % 5 === 1 ? label : ""}</span>
              </div>
            );
          })}
        </div>
        {views === 0 && <p className="text-[0.8125rem] text-muted">Aucune visite enregistrée sur la période : les chiffres apparaîtront dès les premières visites.</p>}
      </Card>

      <div className="grid grid-cols-[1.2fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <Card title="Visites par page" aside={<span className="text-xs font-bold text-subtle">Vues · visiteurs · en ligne</span>}>
          {pages.length === 0 && <p className="text-[0.8125rem] text-muted">Aucune visite enregistrée sur la période.</p>}
          {pages.slice(0, 12).map(([path, n]) => {
            const live = liveByPath.get(path) ?? 0;
            return (
              <div key={path} className="grid grid-cols-[1fr_70px_70px_60px] items-center gap-3 border-b border-line-soft py-2 last:border-b-0">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-col">
                    <span className="truncate text-[0.8125rem] font-bold">{humanize(path)}</span>
                    <span className="truncate text-[0.6875rem] font-semibold text-faint">{path}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-line-soft">
                    <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.max(2, Math.round((n / maxPage) * 100))}%` }} />
                  </div>
                </div>
                <span className="text-right text-[0.8125rem] font-extrabold">{fmt(n)}</span>
                <span className="text-right text-[0.8125rem] font-semibold text-muted">{fmt(pageVisitors.get(path) ?? 0)}</span>
                <span className="text-right text-xs font-bold text-tint-green-ink">{live ? `● ${live}` : ""}</span>
              </div>
            );
          })}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Sources de trafic" aside={<span className="text-xs font-bold text-subtle">Referrers</span>}>
            {sources.length === 0 && <p className="text-[0.8125rem] text-muted">Aucune entrée sur la période.</p>}
            {sources.slice(0, 8).map(([key, n]) => {
              const m = sourceMeta(key);
              const tone = TONE[m.tone];
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[0.6875rem] font-extrabold ${tone.badge}`}>{m.ini}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-[0.8125rem] font-bold" title={key === DIRECT ? "Lien tapé, favori, e-mail ou navigateur qui masque l'origine" : key}>{m.name}</span>
                      <span className="text-[0.8125rem] font-extrabold">{fmt(n)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-pill bg-line-soft">
                      <div className={`h-full rounded-pill ${tone.bar}`} style={{ width: `${Math.max(2, Math.round((n / maxSource) * 100))}%` }} />
                    </div>
                  </div>
                  <span className="w-9 text-right text-xs font-bold text-subtle">{pct(n, entries)}</span>
                </div>
              );
            })}
          </Card>

          <Card title="Appareils">
            {deviceTotal === 0 ? (
              <p className="text-[0.8125rem] text-muted">Pas encore de données.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-pill">
                  {(Object.keys(DEVICE_LABELS) as DeviceKind[]).map((k) => {
                    const n = devices.find(([d]) => d === k)?.[1] ?? 0;
                    return n ? <div key={k} className={`h-full ${DEVICE_BG[k]}`} style={{ width: `${(n / deviceTotal) * 100}%` }} /> : null;
                  })}
                </div>
                <div className="flex flex-wrap gap-4">
                  {(Object.keys(DEVICE_LABELS) as DeviceKind[]).map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-xs font-bold">
                      <span className={`h-2.5 w-2.5 rounded-[3px] ${DEVICE_BG[k]}`} />
                      {DEVICE_LABELS[k]} <span className="text-subtle">{pct(devices.find(([d]) => d === k)?.[1] ?? 0, deviceTotal)}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 items-start gap-3 max-[1099px]:grid-cols-1">
        <Card title="Parcours d'achat" aside={<span className="text-xs font-bold text-subtle">Visiteurs → commande</span>}>
          {funnel.map((f) => (
            <div key={f.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-[0.8125rem] font-bold">{f.name}</span>
                <span className="text-xs font-bold text-subtle">
                  <strong className="text-[0.8125rem] text-ink">{fmt(f.n)}</strong> · {pct(f.n, visitors, f.n && f.n / Math.max(1, visitors) < 0.1 ? 1 : 0)}
                </span>
              </div>
              <div className="h-[26px] overflow-hidden rounded-lg bg-line-soft">
                <div className={`h-full rounded-lg ${f.cls}`} style={{ width: `${visitors ? Math.max(2, Math.round((f.n / visitors) * 100)) : 0}%` }} />
              </div>
            </div>
          ))}
          <p className="text-xs text-subtle">Visiteurs distincts par jour, cumulés. « Commande » = commandes réelles encaissées sur la période.</p>
        </Card>

        <Card title="En ce moment sur le site" aside={<span className="text-xs font-bold text-subtle">Dernières 5 min</span>}>
          {present.length === 0 && <p className="text-[0.8125rem] text-muted">Personne sur le site en ce moment.</p>}
          {present.slice(0, 8).map((p) => (
            <LiveRow key={p.sessionId} p={p} now={now} />
          ))}
          {present.length > 8 && <span className="text-xs font-semibold text-subtle">… et {present.length - 8} autre{present.length - 8 > 1 ? "s" : ""}</span>}
          <div className="flex justify-between text-xs font-bold text-subtle">
            <span>Top source · {topSource ? sourceMeta(topSource[0]).name : "–"}</span>
            <span>Ajouts au panier (1 h) · {cartsLastHour}</span>
          </div>
        </Card>
      </div>
    </>
  );
}

function LiveRow({ p, now }: { p: Present; now: number }) {
  const ago = now - p.lastSeen;
  const when = ago < 45_000 ? "à l'instant" : `il y a ${Math.round(ago / 60_000)} min`;
  const parts: ReactNode[] = [p.source ? sourceMeta(p.source).name : "Source inconnue", p.device ? DEVICE_LABELS[p.device] : null, when].filter(Boolean);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${ago < 60_000 ? "bg-[#7FBF7F]" : "bg-line"}`} aria-hidden="true" />
        <span className="truncate text-[0.8125rem] font-bold">{humanize(p.path)}</span>
      </div>
      <div className="flex gap-2.5 whitespace-nowrap text-xs font-semibold text-subtle">
        {parts.map((x, i) => (
          <span key={i} className="flex gap-2.5">
            {i > 0 && <span>·</span>}
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}
