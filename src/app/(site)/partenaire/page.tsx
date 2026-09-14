import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerTools } from "@/components/site/PartnerTools";
import { IbanForm } from "@/components/site/IbanForm";
import { ViewAsBanner } from "@/components/site/ViewAsBanner";
import { SocialsForm, StepMark } from "@/components/site/SocialsForm";
import { ContractText } from "@/components/site/ContractText";
import { SignedContractView } from "@/components/site/SignedContractView";
import { savePartnerIbanAction, savePartnerSocialsAction } from "@/lib/auth/partner-actions";
import { maskIban, monthLabel } from "@/lib/promos/statements";
import { requireInfluencer } from "@/lib/auth/session";
import { partnerSnapshot } from "@/lib/db/partner";
import { getSettings } from "@/lib/db/settings";
import { getInfluencer, getInfluencerByUid } from "@/lib/db/promos";
import { CAMPAIGN_STATUS_LABELS, COLLABORATION_LABELS, type ContractSignature } from "@/lib/domain/types";
import { formatEuro } from "@/lib/domain/money";
import { PARTNER_PERIODS, type PartnerPeriod } from "@/lib/promos/partner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace partenaire" };

/*
 * Espace partenaire, en parcours (maquette « Partenaire redesign · 1c »).
 *
 * Le héros porte les deux outils — le code et le lien —, parce qu'on revient les chercher
 * à chaque publication. Vient ensuite « Votre parcours » : quatre étapes numérotées qui
 * disent ce qu'il reste à faire, des réseaux à renseigner jusqu'aux ventes à suivre.
 * Les résultats, les contrats et les versements suivent, une teinte par section.
 *
 * Réservé aux comptes portant le
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
  /*
   * Le jeton peut dire « partenaire » alors que la fiche n'existe plus : les rôles sont
   * gravés dans la session à la connexion, et une fiche supprimée ne les réécrit pas.
   * On renvoie donc au compte, plutôt que d'afficher une page introuvable.
   */
  /* En vue « en tant que », le partenaire visé vient du cookie et non du compte. */
  const influencer = user.viewingAs ? await getInfluencer(user.influencerId) : await getInfluencerByUid(user.uid);
  if (!influencer) redirect("/compte");

  const period = (PARTNER_PERIODS.some((p) => p.key === sp.periode) ? sp.periode : "30") as PartnerPeriod;
  const [{ view, statements, kit, campaign, collaborations }, settings] = await Promise.all([
    partnerSnapshot(influencer, period),
    getSettings(),
  ]);
  /* Le contrat de la campagne en cours ; les précédents sont plus bas, en histoire. */
  const signature = collaborations.find((c) => c.campaign.id === campaign?.id)?.signature ?? null;
  const past = collaborations.filter((c) => c.campaign.id !== campaign?.id && c.signature);

  // L'origine configurée, pas un protocole deviné : en local le site n'est pas en https.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const trackingUrl = `${origin}/?ref=${influencer.slug}`;
  const maxBar = Math.max(1, ...view.days.map((d) => d.code + d.link));
  /*
   * Son code, sa remise et la fin de sa campagne viennent de la campagne en cours. Sans
   * campagne, il n'a pas de code — mais son lien de suivi continue de lui attribuer les
   * ventes, et ses résultats restent affichés.
   */
  const shortDay = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const endAt = campaign?.endAt ? shortDay(campaign.endAt) : null;
  const code = campaign?.code ?? "";
  const discount = campaign?.discount ?? 0;

  /* Les quatre étapes du parcours : ce qui est fait, ce qui reste. */
  const socialsDone = !kit.socialsMissing;
  const kitDone = Boolean(kit.order);
  const stepsDone = [socialsDone, kitDone].filter(Boolean).length;
  const contactEmail = settings.contact.email ?? "";
  const kitTracking = kit.order?.tracking?.number || kit.order?.boxtal?.trackingNumber || "";
  const kitSub = kit.order
    ? kitTracking
      ? `Commandé — suivi ${kitTracking}.`
      : "Commandé. Vous recevrez le suivi dès l'expédition."
    : kit.offered
      ? kit.socialsMissing
        ? "Renseignez d'abord un réseau (étape 1) pour pouvoir le commander."
        : `${kit.items.reduce((n, i) => n + i.qty, 0)} imagiers, offerts, livraison comprise, en point relais.`
      : "Aucun kit proposé pour l'instant.";

  return (
    <section className="site-wrap flex flex-col gap-8 py-4 pb-20">
      {user.viewingAs && <ViewAsBanner name={influencer.name} />}

      {/* ---------- Héros : qui vous êtes, et vos deux outils ---------- */}
      <div className="grid grid-cols-2 items-center gap-10 rounded-panel bg-tint-pink p-11 max-[899px]:grid-cols-1 max-[899px]:gap-6 max-[749px]:p-7">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-tint-pink-ink">
            {campaign?.name || (campaign ? "Campagne en cours" : "Votre espace")}
          </span>
          {/* Le nom en entier : un partenaire peut être une marque, sans prénom à extraire. */}
          <h1 className="display-1 text-[clamp(1.875rem,4vw,2.5rem)]">Bonjour {influencer.name}, merci de faire grandir du vrai.</h1>
          <p className="text-sm font-medium leading-relaxed text-tint-pink-ink">
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
          </div>
        </div>
        <PartnerTools code={code} discount={discount} link={trackingUrl} />
      </div>

      {/* ---------- Le parcours, et ce qu'il reste à faire ---------- */}
      <div className="grid grid-cols-[440px_1fr] items-start gap-8 max-[1099px]:grid-cols-1">
        <div className="flex flex-col gap-3.5 min-[1100px]:sticky min-[1100px]:top-6">
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Votre parcours</span>
            <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">
              {stepsDone === 2 ? "Tout est en place" : "Il reste à faire"}
            </h2>
          </div>

          <div className="flex flex-col rounded-card bg-surface px-5">
            <SocialsForm socials={influencer.socials} action={savePartnerSocialsAction} step={1} />

            {/* ---------- 2 · Le kit ---------- */}
            <div id="kit" className="grid scroll-mt-24 grid-cols-[28px_1fr] gap-3.5 border-b border-line-soft py-4">
              <StepMark n={2} done={kitDone} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="text-sm font-extrabold">Kit de bienvenue</span>
                  <span className={`whitespace-nowrap rounded-pill px-2.5 py-[5px] text-[0.6875rem] font-bold ${kitDone ? "bg-tint-green text-tint-green-ink" : kit.offered ? "bg-paper" : "bg-paper text-subtle"}`}>
                    {kitDone ? "Commandé" : kit.offered ? "À commander" : "—"}
                  </span>
                </div>
                <span className="text-xs leading-[1.5] text-muted">{kitSub}</span>
                {kit.items.length > 0 && (
                  <div className="flex gap-1.5 pt-1">
                    {kit.items.map((item) =>
                      item.image ? (
                        <Image key={item.slug} src={item.image.url} alt={item.image.alt || item.title} width={44} height={44} className="h-11 w-11 rounded-[10px] bg-white object-cover" />
                      ) : (
                        <span key={item.slug} className="h-11 w-11 rounded-[10px] bg-paper" />
                      ),
                    )}
                  </div>
                )}
                {kit.prototype && !kitDone && <span className="text-[0.6875rem] text-subtle">Ces exemplaires sont des prototypes : la version définitive peut différer légèrement.</span>}
                {kit.offered && !kitDone && (
                  kit.socialsMissing ? (
                    <span className="w-fit cursor-not-allowed rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white opacity-40">Commander mon kit</span>
                  ) : (
                    <Link href="/partenaire/kit" className="w-fit rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white hover:opacity-80">
                      Commander mon kit
                    </Link>
                  )
                )}
                {kitDone && kit.order && (
                  <Link href={`/compte/commandes/${kit.order.id}`} className="w-fit border-b-[1.5px] border-ink text-xs font-bold">
                    Voir la commande
                  </Link>
                )}
              </div>
            </div>

            {/* ---------- 3 · Les contenus ---------- */}
            {contactEmail && (
              <div id="contenus" className="grid scroll-mt-24 grid-cols-[28px_1fr] gap-3.5 border-b border-line-soft py-4">
                <StepMark n={3} done={false} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-sm font-extrabold">Vos contenus</span>
                    <a href="https://wetransfer.com" target="_blank" rel="noreferrer noopener" className="whitespace-nowrap border-b-[1.5px] border-ink text-xs font-bold">
                      Ouvrir WeTransfer
                    </a>
                  </div>
                  <span className="text-xs leading-[1.5] text-muted">
                    Envoyez le lien de téléchargement à <strong className="text-ink">{contactEmail}</strong>. Qualité
                    d&apos;origine, sans filigrane ni musique protégée, vertical de préférence.
                  </span>
                </div>
              </div>
            )}

            {/* ---------- 4 · Les ventes ---------- */}
            <div className="grid grid-cols-[28px_1fr] gap-3.5 py-4">
              <StepMark n={4} done={false} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="text-sm font-extrabold">Vos ventes</span>
                  <span className="whitespace-nowrap text-xs font-semibold text-subtle">{PARTNER_PERIODS.find((p) => p.key === period)?.label}</span>
                </div>
                <span className="text-xs leading-[1.5] text-muted">
                  {view.orders === 0
                    ? "Aucune vente attribuée pour l'instant : partagez votre code dès la réception du kit."
                    : `${view.orders} vente${view.orders > 1 ? "s" : ""} attribuée${view.orders > 1 ? "s" : ""} · ${view.clicks} clic${view.clicks > 1 ? "s" : ""} sur votre lien.`}
                </span>
              </div>
            </div>
          </div>

          {/* ---------- Nous écrire ---------- */}
          <div className="flex items-center justify-between gap-3 rounded-card bg-tint-sand px-[1.375rem] py-[1.125rem] max-[599px]:flex-col max-[599px]:items-start">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-extrabold">Une question, une idée de contenu ?</span>
              <span className="text-xs text-tint-sand-ink">Réponse sous 48 h ouvrées.</span>
            </span>
            <Link href="/contact" className="whitespace-nowrap rounded-pill bg-ink px-5 py-3 text-[0.8125rem] font-bold text-white hover:opacity-80">
              Nous écrire
            </Link>
          </div>
        </div>

        {/* ---------- Résultats, contrats, versements ---------- */}
        <div className="flex min-w-0 flex-col gap-8">
          {/* ---------- Vos résultats ---------- */}
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Vos résultats</span>
              <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">{PARTNER_PERIODS.find((p) => p.key === period)?.label}</h2>
            </div>

            <nav className="grid grid-cols-3 gap-1 rounded-pill bg-surface p-1 text-xs font-bold" aria-label="Période">
              {PARTNER_PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={p.key === "30" ? "/partenaire" : `/partenaire?periode=${p.key}`}
                  aria-current={p.key === period ? "page" : undefined}
                  className={`rounded-pill py-2.5 text-center ${p.key === period ? "bg-ink text-white" : "hover:opacity-70"}`}
                >
                  {p.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-col gap-[1.125rem] rounded-card bg-tint-green px-5 py-[1.375rem]">
              <div className="flex items-end justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-tint-green-ink">{view.commission !== null ? "Commission estimée" : "CA attribué"}</span>
                  <span className="text-[2.5rem] font-extrabold leading-none tracking-[-0.03em]">
                    {formatEuro(view.commission !== null ? view.commission : view.revenue)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 text-right text-xs font-semibold text-tint-green-ink">
                  <span>
                    <strong className="font-extrabold text-ink">{view.orders}</strong> vente{view.orders > 1 ? "s" : ""}
                  </span>
                  <span>
                    <strong className="font-extrabold text-ink">{view.clicks}</strong> clic{view.clicks > 1 ? "s" : ""}
                  </span>
                  <span>{view.byCode} code · {view.byLink} lien</span>
                </span>
              </div>

              {view.orders > 0 ? (
                <>
                  <div className="flex h-[70px] items-end gap-[3px] border-t border-white/60 pt-3.5" aria-label="Ventes attribuées par jour">
                    {view.days.map((d) => (
                      <span key={d.day} className="flex h-full flex-1 flex-col justify-end gap-px" title={`${d.day} · ${d.code} code · ${d.link} lien`}>
                        <span className="rounded-t-[3px] bg-white" style={{ height: `${Math.round((d.link / maxBar) * 100)}%` }} />
                        <span className="rounded-[2px] bg-ink" style={{ height: `${Math.round((d.code / maxBar) * 100)}%` }} />
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-3 text-[0.6875rem] font-bold text-tint-green-ink">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-ink" /> via code
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-white" /> via lien
                    </span>
                  </div>
                </>
              ) : (
                <p className="border-t border-white/60 pt-3.5 text-[0.8125rem] text-tint-green-ink">
                  Aucune vente pour l&apos;instant : partagez votre code dès la réception du kit.
                </p>
              )}
            </div>

            {view.recent.length > 0 && (
              <div className="flex flex-col rounded-card bg-surface px-5">
                {view.recent.map((o) => (
                  <div key={o.number} className="flex items-center justify-between gap-3 border-b border-line-soft py-3 text-[0.8125rem]">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-bold">{o.number}</span>
                      <span className="text-xs text-subtle">
                        {new Date(o.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · via {o.via === "code" ? "code" : "lien"}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="font-bold">{formatEuro(o.merchandise)}</span>
                      {o.commission !== null && <span className="text-[0.6875rem] font-semibold text-subtle">{formatEuro(o.commission)} pour vous</span>}
                    </span>
                  </div>
                ))}
                <span className="py-3 text-[0.6875rem] text-subtle">Les acheteurs restent anonymes.</span>
              </div>
            )}
          </div>

          {/* ---------- Vos contrats ---------- */}
          {(signature || past.length > 0) && (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Vos contrats</span>
                <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">
                  {signature ? "Un contrat en cours" : `${past.length} contrat${past.length > 1 ? "s" : ""} terminé${past.length > 1 ? "s" : ""}`}
                </h2>
              </div>
              <div className="flex flex-col rounded-card bg-surface px-5">
                {signature && <ContractRow signature={signature} name={campaign?.name || "Campagne en cours"} current />}
                {past.map(({ campaign: c, signature: sig }) =>
                  sig ? <ContractRow key={c.id} signature={sig} name={`${c.name || `Campagne n° ${c.seq}`} · ${CAMPAIGN_STATUS_LABELS[c.status]}`} current={false} /> : null,
                )}
              </div>
              {signature?.summarySnapshot.trim() && (
                <div className="flex flex-col gap-2 rounded-card bg-tint-green p-5 text-tint-green-ink">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em]">Vos engagements</span>
                  <ContractText text={signature.summarySnapshot} className="!text-tint-green-ink" />
                </div>
              )}
            </div>
          )}

          {/* ---------- Vos versements ---------- */}
          {view.commission !== null && (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Vos versements</span>
                <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">Le 5 de chaque mois</h2>
              </div>
              <div className="flex flex-col rounded-card bg-surface px-5">
                {statements.length === 0 ? (
                  <span className="py-4 text-[0.8125rem] text-muted">Aucune vente attribuée pour l&apos;instant.</span>
                ) : (
                  statements.slice(0, 6).map((st) => (
                    <div key={st.month} className="flex items-center justify-between gap-3 border-b border-line-soft py-3.5 text-[0.8125rem]">
                      <span className="flex flex-col gap-0.5">
                        <span className="font-bold capitalize">{monthLabel(st.month)}</span>
                        <span className="text-xs text-subtle">
                          {st.orders} vente{st.orders > 1 ? "s" : ""} · {formatEuro(st.revenue)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-extrabold">{formatEuro(st.commission)}</span>
                        <span className={`rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold ${st.status === "paid" ? "bg-tint-green text-tint-green-ink" : st.status === "current" ? "bg-tint-sand text-tint-sand-ink" : "bg-paper text-subtle"}`}>
                          {st.status === "paid" ? "Versée" : st.status === "current" ? "En cours" : "À venir"}
                        </span>
                      </span>
                    </div>
                  ))
                )}
                <div className="py-3.5">
                  <IbanForm masked={maskIban(influencer.iban)} action={savePartnerIbanAction} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/*
 * Un contrat accepté, tel que le partenaire le retrouve. Le texte montré est la copie
 * figée au moment de la signature — pas le contrat d'aujourd'hui, qui a pu changer.
 */
function ContractRow({ signature, name, current }: { signature: ContractSignature; name: string; current: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-4 last:border-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`truncate text-sm font-bold ${current ? "" : "text-muted"}`}>
          {name} · {COLLABORATION_LABELS[signature.contractType]}
        </span>
        <span className="text-xs font-medium text-subtle">
          Accepté le {new Date(signature.acceptedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} · {signature.contractVersion} · réf.{" "}
          {signature.id.slice(0, 11)}
        </span>
      </span>
      <SignedContractView
        title={signature.contractName}
        version={signature.contractVersion}
        acceptedAt={new Date(signature.acceptedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
        signerName={signature.signerTypedName}
        reference={signature.id}
        body={signature.bodySnapshot}
        label="Relire"
      />
    </div>
  );
}
