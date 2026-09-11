import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/site/CopyValue";
import { IbanForm } from "@/components/site/IbanForm";
import { PartnerKitBlock } from "@/components/site/PartnerKitBlock";
import { TrackingLink } from "@/components/site/TrackingLink";
import { savePartnerIbanAction } from "@/lib/auth/partner-actions";
import { maskIban, monthLabel } from "@/lib/promos/statements";
import { Eyebrow, PillLink } from "@/components/site/ui";
import { requireInfluencer } from "@/lib/auth/session";
import { partnerSnapshot } from "@/lib/db/partner";
import { getInfluencerByUid } from "@/lib/db/promos";
import { formatEuro } from "@/lib/domain/money";
import { PARTNER_PERIODS, type PartnerPeriod } from "@/lib/promos/partner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace partenaire" };

/*
 * Espace partenaire (maquette « Espace Influenceur »). Réservé aux comptes portant le
 * rôle : requireInfluencer() barre la route, il ne se contente pas de cacher des liens.
 *
 * La commission est facultative. Quand elle est fermée, `view.commission` vaut null et
 * TOUT ce qui s'y rapporte disparaît — la tuile, la colonne du tableau, la phrase du
 * héros. Rien ne doit laisser deviner qu'une commission puisse exister.
 *
 * Les acheteurs restent anonymes : seuls le numéro, la date, le canal et le montant des
 * livres remontent jusqu'ici (voir lib/promos/partner.ts).
 */
export default async function PartnerSpace({ searchParams }: PageProps<"/partenaire">) {
  const [user, sp] = await Promise.all([requireInfluencer(), searchParams]);
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) notFound();

  const period = (PARTNER_PERIODS.some((p) => p.key === sp.periode) ? sp.periode : "30") as PartnerPeriod;
  const { view, statements, kit } = await partnerSnapshot(influencer, period);

  // L'origine configurée, pas un protocole deviné : en local le site n'est pas en https.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const trackingUrl = `${origin}/?ref=${influencer.slug}`;
  const maxBar = Math.max(1, ...view.days.map((d) => d.code + d.link));
  const endAt = influencer.endAt ? new Date(influencer.endAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : null;

  return (
    <section className="site-wrap flex flex-col gap-4 py-4 pb-20">
      {/* ---------- Héro ---------- */}
      <div className="grid grid-cols-[1.1fr_1fr] items-stretch gap-4 max-[899px]:grid-cols-1">
        <div className="flex flex-col justify-center gap-4 rounded-panel bg-tint-pink p-12 max-[749px]:p-8">
          <Eyebrow className="text-tint-pink-ink">Campagne en cours</Eyebrow>
          {/* Le nom en entier : un partenaire peut être une marque, sans prénom à extraire. */}
          <h1 className="display-1 text-[clamp(1.875rem,4vw,2.75rem)]">Bonjour {influencer.name}, merci de faire grandir du vrai.</h1>
          <p className="text-[0.9375rem] leading-relaxed text-tint-pink-ink">
            Chaque commande passée avec votre code, ou dans les 30 jours suivant un clic sur votre lien, vous est
            attribuée.
            {view.commission !== null && (
              <>
                {" "}
                Vous touchez <strong className="text-ink">{influencer.rate} % du montant des livres</strong> (hors port).
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-pill bg-white px-3.5 py-2">{influencer.active ? "Active" : "En pause"}</span>
            {endAt && <span className="rounded-pill bg-white px-3.5 py-2">Fin de campagne · {endAt}</span>}
            <span className="rounded-pill bg-white px-3.5 py-2">−{influencer.discount} % pour votre communauté</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-card bg-white p-7">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Votre code</span>
              <span className="text-xs font-semibold text-subtle">−{influencer.discount} % sur les livres</span>
            </div>
            <CopyValue value={influencer.code} label="Copier" display="code" />
          </div>
          <div className="flex flex-col gap-3 rounded-card bg-white p-7">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Votre lien de suivi</span>
              <span className="text-xs font-semibold text-subtle">attribution 30 jours</span>
            </div>
            <TrackingLink url={trackingUrl} />
          </div>
        </div>
      </div>

      {/* ---------- Kit de bienvenue ---------- */}
      {/* Bon de commande tant qu'il n'a pas été commandé, suivi ensuite. */}
      <PartnerKitBlock kit={kit} />

      {/* ---------- Résultats ---------- */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[1.75rem] font-extrabold tracking-[-0.01em]">Vos résultats</h2>
          <span className="text-[0.8125rem] font-semibold text-subtle">Commandes réellement encaissées</span>
        </div>
        <nav className="flex gap-1.5 rounded-pill bg-white p-1.5 text-xs font-bold" aria-label="Période">
          {PARTNER_PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/partenaire?periode=${p.key}`}
              aria-current={p.key === period ? "page" : undefined}
              className={`rounded-pill px-3.5 py-2 ${p.key === period ? "bg-ink text-white" : "hover:bg-paper"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className={`grid gap-3 ${view.commission !== null ? "grid-cols-4" : "grid-cols-3"} max-[989px]:!grid-cols-2 max-[599px]:!grid-cols-1`}>
        <Tile tone="bg-tint-green" label="Ventes attribuées" value={String(view.orders)} note={`${view.byCode} via code · ${view.byLink} via lien`} noteTone="text-tint-green-ink" />
        <Tile tone="bg-white" label="Chiffre d'affaires attribué" value={formatEuro(view.revenue)} note="livres uniquement, hors port" />
        {view.commission !== null && (
          <Tile tone="bg-ink text-white" label="Votre commission" value={formatEuro(view.commission)} note={`${influencer.rate} % du CA attribué`} labelTone="text-[#bbb]" noteTone="text-[#bbb]" />
        )}
        <Tile tone="bg-white" label="Clics sur le lien" value={view.clicks.toLocaleString("fr-FR")} note={`taux de conversion ${view.conversion.toFixed(1).replace(".", ",")} %`} />
      </div>

      {/* ---------- Graphique et commandes ---------- */}
      <div className="flex flex-col gap-4 rounded-card bg-white p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-base font-extrabold">Ventes par {view.days.length > 31 ? "semaine" : "jour"}</span>
          <div className="flex gap-4 text-xs font-bold text-subtle">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-ink" />
              via code
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-tint-green" />
              via lien
            </span>
          </div>
        </div>

        {view.orders === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Aucune vente attribuée sur cette période.</p>
        ) : (
          <div className="flex h-[150px] items-end gap-1">
            {view.days.map((d) => {
              const total = d.code + d.link;
              return (
                <div
                  key={d.day}
                  title={`${new Date(`${d.day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${d.code} via code · ${d.link} via lien`}
                  className="flex h-full flex-1 flex-col justify-end gap-px"
                >
                  <div className="rounded-t-[3px] bg-tint-green" style={{ height: `${(d.link / maxBar) * 100}%` }} />
                  <div className="rounded-[2px] bg-ink" style={{ height: `${(d.code / maxBar) * 100}%` }} />
                  {total === 0 && <div className="h-px bg-line-soft" />}
                </div>
              );
            })}
          </div>
        )}

        {view.recent.length > 0 && (
          <div className="flex flex-col border-t border-line-soft">
            <div className={`grid gap-3 py-3 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint ${view.commission !== null ? "grid-cols-[90px_1fr_120px_100px_100px]" : "grid-cols-[90px_1fr_120px_100px]"} max-[749px]:hidden`}>
              <span>Commande</span>
              <span>Date</span>
              <span>Attribution</span>
              <span className="text-right">Livres</span>
              {view.commission !== null && <span className="text-right">Commission</span>}
            </div>
            {view.recent.map((o) => (
              <div
                key={o.number}
                className={`grid items-center gap-3 border-t border-line-soft py-3 text-[0.8125rem] ${view.commission !== null ? "grid-cols-[90px_1fr_120px_100px_100px]" : "grid-cols-[90px_1fr_120px_100px]"} max-[749px]:grid-cols-2`}
              >
                <span className="font-bold">{o.number}</span>
                <span className="text-subtle">{new Date(o.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                <span>
                  <span className={`rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold ${o.via === "code" ? "bg-ink text-white" : "bg-tint-green text-tint-green-ink"}`}>
                    {o.via === "code" ? `code ${influencer.code}` : "lien"}
                  </span>
                </span>
                <span className="text-right font-semibold">{formatEuro(o.merchandise)}</span>
                {o.commission !== null && <span className="text-right font-extrabold">{formatEuro(o.commission)}</span>}
              </div>
            ))}
            <span className="pt-3 text-xs leading-relaxed text-subtle">
              Les acheteurs restent anonymes : seuls le numéro, la date et le montant des livres vous sont montrés.
            </span>
          </div>
        )}
      </div>

      {/* ---------- Relevés et kit ---------- */}
      <div className="grid grid-cols-1 items-start gap-4">
        {/* Les relevés n'existent que pour un partenaire commissionné. */}
        {view.commission !== null && (
          <div className="flex flex-col gap-3.5 rounded-card bg-white p-7">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-extrabold">Vos commissions</span>
              <span className="text-xs font-semibold text-subtle">versées le 5 du mois</span>
            </div>
            {statements.length === 0 ? (
              <p className="text-sm text-muted">Aucune vente attribuée pour l'instant.</p>
            ) : (
              statements.slice(0, 6).map((st) => (
                <div key={st.month} className="flex items-center justify-between gap-3 border-t border-line-soft pt-3 text-[0.8125rem]">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-bold capitalize">{monthLabel(st.month)}</span>
                    <span className="text-xs text-subtle">
                      {st.status === "current" ? `en cours · ${st.orders} vente${st.orders > 1 ? "s" : ""} à ce jour` : `${st.orders} vente${st.orders > 1 ? "s" : ""}`}
                      {st.paidAt ? ` · versée le ${new Date(st.paidAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                    </span>
                    {/* Une reprise se dit, sinon le montant baisse sans explication. */}
                    {st.clawbacks.map((c) => (
                      <span key={c.orderNumber} className="text-xs text-tint-sand-ink">
                        Reprise {formatEuro(c.amount)} · commande {c.orderNumber} remboursée
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="whitespace-nowrap font-extrabold">{formatEuro(st.commission)}</span>
                    <span
                      className={`whitespace-nowrap rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold ${
                        st.status === "paid" ? "bg-tint-green text-tint-green-ink" : st.status === "current" ? "bg-tint-sand text-tint-sand-ink" : "bg-paper text-ink"
                      }`}
                    >
                      {st.status === "paid" ? "Payée" : st.status === "current" ? "En cours" : "À venir"}
                    </span>
                  </div>
                </div>
              ))
            )}
            <IbanForm masked={maskIban(influencer.iban)} action={savePartnerIbanAction} />
          </div>
        )}

      </div>

      {/* ---------- Contact ---------- */}
      <div className="mt-6 grid grid-cols-[1fr_auto] items-center gap-8 rounded-panel bg-tint-green p-10 max-[899px]:grid-cols-1">
        <div className="flex flex-col gap-2">
          <h2 className="text-[1.625rem] font-extrabold tracking-[-0.01em]">Une question, une idée de contenu ?</h2>
          <p className="text-sm leading-relaxed text-tint-green-ink">
            Écrivez-nous directement, nous répondons sous 48 h ouvrées. Envie de livres à offrir à votre communauté ?
            Dites-le nous, on organise un jeu-concours ensemble.
          </p>
        </div>
        <PillLink href="/contact" variant="dark" className="w-fit">
          Nous écrire
        </PillLink>
      </div>
    </section>
  );
}

function Tile({ tone, label, value, note, labelTone = "text-subtle", noteTone = "text-subtle" }: { tone: string; label: string; value: string; note: string; labelTone?: string; noteTone?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-card p-6 ${tone}`}>
      <span className={`text-xs font-bold ${labelTone}`}>{label}</span>
      <span className="text-[2rem] font-extrabold leading-none tracking-[-0.02em]">{value}</span>
      <span className={`text-xs font-semibold ${noteTone}`}>{note}</span>
    </div>
  );
}
