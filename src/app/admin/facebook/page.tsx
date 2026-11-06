import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmitSelect";
import {
  FbCopy,
  FbKeyField,
  FbMessageButtons,
  FbModal,
  FbPostInput,
  FbScanAll,
  FbScanMemberships,
  FbScanProvider,
  FbScanStaffReplies,
  FbScriptLink,
  FbStaffEditor,
  FbVerify,
  FbVerifyMembership,
  FbVerifyStaff,
  type StaffScanItem,
} from "@/components/admin/FbGroupTools";
import { Card, Field, Input, Notice, PageHeader, Pill, Textarea, Tile } from "@/components/admin/ui";
import {
  addFbGroupAction,
  deleteFbGroupAction,
  markFbSeenAction,
  quickFbGroupAction,
  recordFbMembershipScanAction,
  recordFbScanAction,
  recordFbStaffReplyAction,
  revokeFbKeyAction,
  rotateFbKeyAction,
  saveFbGroupAction,
  saveFbLandingAction,
  saveFbStaffAction,
  setFbPostAction,
} from "@/lib/admin/actions/fb-groups";
import { requireAdmin } from "@/lib/auth/session";
import { fbStatsByGroup, getFbConfig, listFbClicks, listFbGroups } from "@/lib/db/fb-groups";
import { now as clock } from "@/lib/db/helpers";
import {
  CONTACT_LABELS,
  DIRECT_KEY,
  FB_CONTACT_STATES,
  FB_MEMBERSHIPS,
  FB_POST_STATES,
  FB_STAFF_FILTERS,
  FB_TABS,
  MEMBERSHIP_LABELS,
  MEMBERSHIP_SCAN_LABELS,
  NO_STATS,
  POST_LABELS,
  SCAN_LABELS,
  STAFF_FILTER_LABELS,
  STAFF_LABELS,
  STAFF_REPLY_LABELS,
  TAB_LABELS,
  addedToday,
  aggregateClicks,
  fillMessage,
  groupStage,
  matchesStaffFilters,
  newComments,
  staffKey,
  staffAutoReply,
  staffReplyState,
  staffUrl,
  trackingLink,
  type FbContactState,
  type FbGroup,
  type FbGroupStats,
  type FbMembership,
  type FbMetrics,
  type FbStaffFilter,
  type FbTab,
  type Ranked,
} from "@/lib/domain/fb-groups";
import { PACE, agentPrompt } from "@/lib/fb-groups/prompt";
import { siteUrl } from "@/lib/fb-groups/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campagnes Facebook" };

/*
 * Campagnes Facebook — repris du gestionnaire de groupes de COBA.
 *
 * Claude (dans Chrome) cherche les groupes, demande à les rejoindre au rythme écrit
 * dans le prompt, et rédige pour chacun un message qu'il enregistre par l'API. Cet
 * écran tient la liste : où en est l'adhésion, le message prêt à copier (le lien de
 * suivi du groupe glissé à la place de `{lien}`), le post une fois publié, et les clics
 * que le lien a rapportés — robots et doublons écartés, détail au clic.
 *
 * Rien n'y est publié automatiquement : c'est nous qui postons, en copiant le message.
 */

type Sp = { onglet?: string; q?: string; tri?: string; stats?: string; adhesion?: string; admins?: string; contact?: string };

const DAY = 86_400_000;
const fmt = (n: number) => n.toLocaleString("fr-FR");
const fullDate = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" });

/** « il y a 2 h », mais « le 4 nov. 2026 » au-delà d'une semaine : « il y a 4 nov. » ne se lit pas. */
function ago(ts: number | null, now: number): string {
  if (!ts) return "—";
  const d = now - ts;
  if (d < 60_000) return "à l'instant";
  if (d < 3_600_000) return `il y a ${Math.floor(d / 60_000)} min`;
  if (d < DAY) return `il y a ${Math.floor(d / 3_600_000)} h`;
  if (d < 7 * DAY) return `il y a ${Math.floor(d / DAY)} j`;
  return `le ${fullDate(ts)}`;
}

function href(sp: Sp, patch: Partial<Sp>): string {
  const next = { ...sp, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin/facebook?${s}` : "/admin/facebook";
}

export default async function FacebookPage({ searchParams }: PageProps<"/admin/facebook">) {
  await requireAdmin();
  const raw = await searchParams;
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const sp: Sp = { onglet: one("onglet"), q: one("q"), tri: one("tri"), stats: one("stats"), adhesion: one("adhesion"), admins: one("admins"), contact: one("contact") };
  const now = clock();

  const [groups, config, stats] = await Promise.all([listFbGroups(), getFbConfig(), fbStatsByGroup()]);
  const site = siteUrl();
  const api = `${site}/api/fb-groups`;
  const linkOf = (g: FbGroup) => trackingLink(site, config.landingPath, g.slug);
  const statOf = (g: FbGroup): FbGroupStats => stats[g.slug] ?? NO_STATS;

  /* ---------- Chiffres ---------- */
  const members = groups.filter((g) => g.membership === "validated").length;
  const pending = groups.filter((g) => g.membership === "pending").length;
  const refused = groups.filter((g) => g.membership === "refused").length;
  const toPost = groups.filter((g) => g.membership === "validated" && g.message && !g.postUrl && g.status === "new").length;
  const posted = groups.filter((g) => g.postUrl).length;
  const clicks = groups.reduce((s, g) => s + statOf(g).clicks, 0);
  const clicks7 = groups.reduce((s, g) => s + statOf(g).last7, 0);
  const today = addedToday(groups, now);

  /* ---------- Liste ---------- */
  const tab = (FB_TABS as readonly string[]).includes(sp.onglet ?? "") ? (sp.onglet as FbTab) : null;
  const membership = (FB_MEMBERSHIPS as readonly string[]).includes(sp.adhesion ?? "") ? (sp.adhesion as FbMembership) : null;
  const staffFilter = (FB_STAFF_FILTERS as readonly string[]).includes(sp.admins ?? "") ? (sp.admins as FbStaffFilter) : null;
  /* L'état du contact n'a de sens qu'avec des admins renseignés : sans « Avec admins renseignés », il est ignoré. */
  const contact = staffFilter === "with" && (FB_CONTACT_STATES as readonly string[]).includes(sp.contact ?? "") ? (sp.contact as FbContactState) : null;
  const q = (sp.q ?? "").trim().toLowerCase();
  /* Chaque filtre compte dans ce que laissent passer ceux d'avant : onglet, adhésion, admins, contact. */
  const inTab = groups.filter((g) => !tab || g.status === tab);
  const inMembership = inTab.filter((g) => !membership || g.membership === membership);
  const withStaff = inMembership.filter((g) => matchesStaffFilters(g, { staff: "with" }));
  const shown = inMembership
    .filter((g) => matchesStaffFilters(g, { staff: staffFilter, contact }))
    .filter((g) => !q || `${g.name} ${g.slug} ${g.groupUrl} ${g.note} ${g.staff.map((p) => p.name).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => (sp.tri === "clics" ? statOf(b).clicks - statOf(a).clicks : sp.tri === "commentaires" ? newComments(b) - newComments(a) || (b.scan?.comments ?? -1) - (a.scan?.comments ?? -1) : 0) || b.createdAt - a.createdAt);
  const unread = groups.reduce((s, g) => s + newComments(g), 0);
  const count = (t: FbTab) => groups.filter((g) => g.status === t).length;

  const detail = sp.stats ? groups.find((g) => g.slug === sp.stats) : undefined;
  const metrics = detail ? aggregateClicks(await listFbClicks(detail.slug), 30, now) : null;

  return (
    <>
      <PageHeader
        title="Campagnes Facebook"
        subtitle="Les groupes où l'on présente Mon Vrai : Claude les trouve, les rejoint et rédige un message pour chacun ; vous le copiez et le postez."
      />

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2 max-[599px]:grid-cols-1">
        <Tile label="Groupes suivis" value={fmt(groups.length)} note={today ? `${today} ajouté${today > 1 ? "s" : ""} aujourd'hui par Claude` : "aucun ajout aujourd'hui"} />
        <Tile tone="green" label="Membre" value={fmt(members)} note={`${pending} adhésion${pending > 1 ? "s" : ""} en attente${refused ? ` · ${refused} refusée${refused > 1 ? "s" : ""}` : ""}`} />
        <Tile tone="sand" label="À poster" value={fmt(toPost)} note={`membre, message prêt · ${posted} déjà posté${posted > 1 ? "s" : ""}`} />
        <Tile tone="blue" label="Clics" value={fmt(clicks)} note={`${clicks7} sur 7 jours · robots et doublons écartés`} />
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        {/* ---------- Claude dans Chrome ---------- */}
        <Card title="Claude dans Chrome" aside={config.apiKey ? <Pill tone="ok">Clé active</Pill> : <Pill tone="muted">Pas de clé</Pill>}>
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Le prompt demande d'abord à Claude de vous faire décrire les groupes cherchés et combien en rejoindre, puis il
            cherche, demande l'adhésion, rédige le message de chaque groupe et l'enregistre ici, et termine par un compte
            rendu. Rythme imposé : {PACE.waitMin} à {PACE.waitMax} s entre deux demandes, une pause de {PACE.pauseMin} à{" "}
            {PACE.pauseMax} min toutes les {PACE.burst}, arrêt au premier avertissement de Facebook.
          </p>

          {config.apiKey ? (
            <>
              <FbKeyField apiKey={config.apiKey} />
              <div className="flex flex-wrap items-center gap-2">
                <FbCopy tone="ink" label="Copier le prompt" text={agentPrompt({ site, api, key: config.apiKey })} />
                <a href={`${api}/openapi.json`} target="_blank" rel="noreferrer" className="rounded-pill bg-paper px-3 py-2 text-[0.6875rem] font-bold hover:opacity-70">
                  Documentation de l'API ↗
                </a>
                <span className="flex-1" />
                <ActionForm action={rotateFbKeyAction} submitLabel="Régénérer" submitTone="ghost" confirm="Générer une nouvelle clé ? L'ancienne cessera aussitôt de fonctionner, y compris dans un prompt déjà donné à Claude." className="!gap-0 [&_button]:!px-2 [&_button]:text-[0.6875rem]">
                  <span hidden />
                </ActionForm>
                <ActionForm action={revokeFbKeyAction} submitLabel="Révoquer" submitTone="ghost" confirm="Révoquer la clé ? L'API refusera toute requête jusqu'à ce que vous en génériez une nouvelle." className="!gap-0 [&_button]:!px-2 [&_button]:text-[0.6875rem] [&_button]:text-danger">
                  <span hidden />
                </ActionForm>
              </div>
              {config.keyCreatedAt && <p className="text-xs text-subtle">Clé générée le {fullDate(config.keyCreatedAt)}. Elle n'ouvre que cette API : lister, ajouter et suivre des groupes.</p>}
            </>
          ) : (
            <ActionForm action={rotateFbKeyAction} submitLabel="Générer une clé" footerNote="Le prompt contient la clé : il se copie une fois celle-ci générée.">
              <span hidden />
            </ActionForm>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Ajouter un groupe">
            <ActionForm action={addFbGroupAction} submitLabel="Ajouter">
              <Field label="Lien du groupe">
                <Input name="url" placeholder="https://www.facebook.com/groups/…" required autoComplete="off" />
              </Field>
              <Field label="Nom" hint="Tel qu'affiché sur Facebook : il donne l'identifiant du lien de suivi.">
                <Input name="name" required autoComplete="off" />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Page d'arrivée" collapsible aside={<code className="text-xs text-subtle">{config.landingPath}</code>}>
            <ActionForm action={saveFbLandingAction} footerNote="Vaut pour tous les liens, y compris ceux des messages déjà rédigés.">
              <Field label="Chemin du site" name="landingPath" hint="Où mène le lien de suivi : / pour l'accueil, /catalogue, /le-concept…">
                <Input name="landingPath" defaultValue={config.landingPath} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </div>

      {/* ---------- Les groupes ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Onglets">
          {[{ key: "", label: "Tous", n: groups.length }, ...FB_TABS.map((t) => ({ key: t, label: TAB_LABELS[t], n: count(t) }))].map((t) => (
            <Link key={t.key} href={href(sp, { onglet: t.key, stats: "" })} aria-current={(tab ?? "") === t.key ? "page" : undefined} className={`rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold ${(tab ?? "") === t.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
              {t.label}
              <span className="ml-1.5 opacity-60">{t.n}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "", label: "Récents" },
            { key: "clics", label: "Clics" },
            { key: "commentaires", label: unread ? `Non lus (${unread})` : "Commentaires" },
          ].map((t) => (
            <Link key={t.key} href={href(sp, { tri: t.key, stats: "" })} aria-current={(sp.tri ?? "") === t.key ? "true" : undefined} className={`rounded-pill px-3.5 py-2.5 text-xs font-bold ${(sp.tri ?? "") === t.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
              {t.label}
            </Link>
          ))}
          <form action="/admin/facebook" method="get" role="search">
            {sp.onglet && <input type="hidden" name="onglet" value={sp.onglet} />}
            {sp.tri && <input type="hidden" name="tri" value={sp.tri} />}
            {sp.adhesion && <input type="hidden" name="adhesion" value={sp.adhesion} />}
            {sp.admins && <input type="hidden" name="admins" value={sp.admins} />}
            {sp.contact && <input type="hidden" name="contact" value={sp.contact} />}
            <input type="search" name="q" defaultValue={sp.q} placeholder="Rechercher un groupe…" className="min-w-[220px] rounded-pill bg-surface px-[1.125rem] py-3 text-[0.8125rem] font-semibold outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />
          </form>
        </div>
      </div>

      {/* L'adhésion filtre dans l'onglet choisi : les nombres sont ceux de cet onglet. */}
      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Adhésion">
        {[{ key: "", label: "Toutes les adhésions", n: inTab.length }, ...FB_MEMBERSHIPS.map((m) => ({ key: m, label: MEMBERSHIP_LABELS[m], n: inTab.filter((g) => g.membership === m).length }))].map((m) => (
          <Link key={m.key} href={href(sp, { adhesion: m.key, stats: "" })} aria-current={(membership ?? "") === m.key ? "true" : undefined} className={`rounded-pill px-3.5 py-2 text-xs font-bold ${(membership ?? "") === m.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
            {m.label}
            <span className="ml-1.5 opacity-60">{m.n}</span>
          </Link>
        ))}
      </nav>

      {/*
        Les admins, dans l'onglet et l'adhésion choisis. L'état du contact n'apparaît qu'avec
        « Avec admins renseignés », et quitter ce choix l'efface (`contact` remis à vide).
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Admins renseignés">
          {[{ key: "", label: "Admins renseignés ou non", n: inMembership.length }, ...FB_STAFF_FILTERS.map((f) => ({ key: f, label: STAFF_FILTER_LABELS[f], n: f === "with" ? withStaff.length : inMembership.length - withStaff.length }))].map((f) => (
            <Link key={f.key} href={href(sp, { admins: f.key, contact: f.key === "with" ? sp.contact : "", stats: "" })} aria-current={(staffFilter ?? "") === f.key ? "true" : undefined} className={`rounded-pill px-3.5 py-2 text-xs font-bold ${(staffFilter ?? "") === f.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
              {f.label}
              <span className="ml-1.5 opacity-60">{f.n}</span>
            </Link>
          ))}
        </nav>
        {staffFilter === "with" && (
          <nav className="flex flex-wrap items-center gap-1.5 border-l border-line-soft pl-1.5" aria-label="État du contact des admins">
            {[{ key: "", label: "Tous les contacts", n: withStaff.length }, ...FB_CONTACT_STATES.map((c) => ({ key: c, label: CONTACT_LABELS[c], n: withStaff.filter((g) => matchesStaffFilters(g, { contact: c })).length }))].map((c) => (
              <Link key={c.key} href={href(sp, { contact: c.key, stats: "" })} aria-current={(contact ?? "") === c.key ? "true" : undefined} className={`rounded-pill px-3.5 py-2 text-xs font-bold ${(contact ?? "") === c.key ? "bg-ink text-on-ink" : "bg-surface hover:opacity-70"}`}>
                {c.label}
                <span className="ml-1.5 opacity-60">{c.n}</span>
              </Link>
            ))}
          </nav>
        )}
        {(membership || staffFilter) && (
          <Link href={href(sp, { adhesion: "", admins: "", contact: "", stats: "" })} className="px-2 py-2 text-xs font-bold text-subtle hover:text-ink">
            Effacer les filtres
          </Link>
        )}
      </div>

      <FbScanProvider record={recordFbScanAction} recordMembership={recordFbMembershipScanAction} recordStaffReply={recordFbStaffReplyAction}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <FbScriptLink />
        <FbScanStaffReplies items={shown.flatMap((g) => g.staff.filter((p) => p.conversationUrl).map((p) => ({ slug: g.slug, key: staffKey(p), url: p.conversationUrl!, name: p.name })))} />
        <FbScanMemberships groups={shown.filter((g) => g.membership === "pending" || g.membership === "refused").map((g) => ({ id: g.slug, url: g.groupUrl }))} />
        <FbScanAll posts={shown.filter((g) => g.postUrl).map((g) => ({ id: g.slug, url: g.postUrl! }))} />
      </div>
      <section className="flex flex-col rounded-card bg-surface px-6 py-2">
        {shown.length === 0 && (
          <p className="py-6 text-sm text-muted">
            {groups.length === 0 ? "Aucun groupe pour l'instant. Générez une clé, copiez le prompt et donnez-le à Claude dans Chrome." : "Aucun groupe ne correspond."}
          </p>
        )}
        {shown.map((g) => (
          <GroupRow key={g.slug} g={g} stat={statOf(g)} link={linkOf(g)} statsHref={href(sp, { stats: g.slug })} now={now} />
        ))}
      </section>
      </FbScanProvider>

      {detail && metrics && (
        <FbModal
          closeHref={href(sp, { stats: "" })}
          title={detail.name}
          footer={
            <>
              <code className="min-w-0 flex-1 truncate text-xs text-subtle">{linkOf(detail)}</code>
              <FbCopy text={linkOf(detail)} label="Copier le lien" />
            </>
          }
        >
          <GroupMetrics m={metrics} />
        </FbModal>
      )}
      {sp.stats && !detail && <Notice tone="error">Ce groupe n'est plus suivi.</Notice>}
    </>
  );
}

/* ---------- Une ligne ---------- */

const tiny = "!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:!py-1 [&_button]:text-[0.6875rem]";

/*
 * Une ligne par groupe, REPLIÉE sur son nom : on travaille groupe par groupe, et
 * déplier les trente pour en traiter un revenait à faire défiler tout ce qui est fait
 * pour retrouver ce qui reste. Toutes repliées, donc, sans exception — ouvrir celles
 * qui attendent quelque chose de nous a été essayé et rendait dix-sept lignes sur
 * trente-trois, c'est-à-dire le mur qu'on voulait éviter. C'est l'étape affichée sur
 * la ligne (`groupStage`) qui dit où regarder, et les onglets qui trient.
 *
 * Ce qu'on ouvre le reste : `open` n'est pas une prop, l'état vit dans le DOM et
 * survit donc aux enregistrements de la ligne — les listes déroulantes s'envoient
 * toutes seules et rendent la page à chaque fois.
 */
function GroupRow({ g, stat, link, statsHref, now }: { g: FbGroup; stat: FbGroupStats; link: string; statsHref: string; now: number }) {
  const final = g.message ? fillMessage(g.message, link) : null;
  const stage = groupStage(g);
  return (
    <details className="group/row border-t border-line-soft first:border-t-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 py-4 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-xs font-bold text-faint transition-transform group-open/row:rotate-90">
          ▸
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{g.name}</span>
        <Pill tone={stage.tone}>{stage.label}</Pill>
        <span className="whitespace-nowrap text-xs font-semibold text-subtle">
          {fmt(stat.clicks)} clic{stat.clicks > 1 ? "s" : ""}
        </span>
      </summary>

      <article className="flex flex-col gap-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <a href={g.groupUrl} target="_blank" rel="noreferrer" className="text-sm font-extrabold hover:underline">
              Ouvrir le groupe <span className="text-subtle">↗</span>
            </a>
            <span className="text-xs font-semibold text-faint">
              fb={g.slug}
              {g.members !== null && ` · ${fmt(g.members)} membres`} · ajouté {ago(g.createdAt, now)} {g.addedBy === "agent" ? "par Claude" : "à la main"}
            </span>
          </div>
          {/* Le total est déjà sur la ligne repliée : ici, ce qu'elle ne porte pas — la semaine, la date, et l'entrée du détail. */}
          <Link href={statsHref} scroll={false} title="Voir le détail des clics" className="flex flex-wrap items-center gap-1.5 rounded-pill hover:opacity-70">
            {stat.last7 > 0 && <Pill tone="warn">{stat.last7} sur 7 j</Pill>}
            <span className="text-xs font-semibold text-subtle">{stat.last ? `dernier clic ${ago(stat.last, now)}` : "détail des clics"} ›</span>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionForm action={quickFbGroupAction} hideFooter className="!gap-0">
            <input type="hidden" name="slug" value={g.slug} />
            <AutoSubmitSelect name="membership" label={`Adhésion à ${g.name}`} value={g.membership} options={FB_MEMBERSHIPS.map((m) => ({ value: m, label: `Adhésion : ${MEMBERSHIP_LABELS[m]}` }))} className="!w-auto" />
          </ActionForm>
          <MembershipScan g={g} now={now} />
          <ActionForm action={quickFbGroupAction} hideFooter className="!gap-0">
            <input type="hidden" name="slug" value={g.slug} />
            <AutoSubmitSelect name="status" label={`Onglet de ${g.name}`} value={g.status} options={FB_TABS.map((t) => ({ value: t, label: `Onglet : ${TAB_LABELS[t]}` }))} className="!w-auto" />
          </ActionForm>
          <span className="flex-1" />
          <FbMessageButtons text={final} groupName={g.name} />
          <FbCopy text={link} label="Copier le lien" />
        </div>

        {/* Le post : son lien, saisi sur place et enregistré en quittant le champ, et son état à côté. */}
        <div className="flex flex-wrap items-center gap-2">
          <ActionForm action={setFbPostAction} hideFooter className="!gap-0 min-w-0 flex-1">
            <input type="hidden" name="slug" value={g.slug} />
            <FbPostInput key={g.postUrl ?? ""} initial={g.postUrl ?? ""} />
          </ActionForm>
          {g.postUrl ? (
            <>
              <ActionForm action={quickFbGroupAction} hideFooter className="!gap-0">
                <input type="hidden" name="slug" value={g.slug} />
                <AutoSubmitSelect name="postStatus" label={`État du post dans ${g.name}`} value={g.postStatus ?? "pending"} options={FB_POST_STATES.map((p) => ({ value: p, label: POST_LABELS[p] }))} className="!w-auto" />
              </ActionForm>
              <a href={g.postUrl} target="_blank" rel="noreferrer" className="rounded-pill bg-paper px-3 py-2 text-[0.6875rem] font-bold hover:opacity-70">
                Ouvrir ↗
              </a>
            </>
          ) : (
            <span className="text-xs font-semibold text-faint">Pas encore posté</span>
          )}
        </div>

        {g.postUrl && <ScanLine g={g} now={now} />}

        {g.note && <p className="text-xs font-semibold text-tint-sand-ink">ⓘ {g.note}</p>}

        <StaffLine g={g} now={now} />

        <details className="group">
          <summary className="w-fit cursor-pointer list-none text-[0.6875rem] font-bold text-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Modifier ▸</span>
            <span className="hidden group-open:inline">Replier ▾</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3 rounded-[18px] bg-paper p-4">
            <ActionForm action={saveFbGroupAction} submitLabel="Enregistrer le groupe">
              <input type="hidden" name="slug" value={g.slug} />
              <div className="grid grid-cols-[1fr_160px] gap-3 max-[699px]:grid-cols-1">
                <Field label="Nom">
                  <Input name="name" defaultValue={g.name} className="!bg-surface" />
                </Field>
                <Field label="Membres">
                  <Input name="members" inputMode="numeric" defaultValue={g.members ?? ""} className="!bg-surface" />
                </Field>
              </div>
              <Field label="Note" hint="Ce qu'il faut savoir du groupe : règle de publication, jour des annonces…">
                <Input name="note" defaultValue={g.note} className="!bg-surface" />
              </Field>
              <Field label="Message" name="message" hint="{lien} marque l'endroit du lien de suivi du groupe ; laissé vide, le message est effacé.">
                <Textarea name="message" defaultValue={g.message ?? ""} rows={8} className="!bg-surface" />
              </Field>
            </ActionForm>
            <ActionForm action={deleteFbGroupAction} submitLabel="Supprimer le groupe" submitTone="ghost" confirm={`Supprimer « ${g.name} » du suivi ? Ses clics restent en base, mais son lien ne sera plus attribué.`} className={`${tiny} [&_button]:text-danger`}>
              <input type="hidden" name="slug" value={g.slug} />
            </ActionForm>
          </div>
        </details>
      </article>
    </details>
  );
}

/* ---------- L'adhésion ---------- */

const MEMBERSHIP_SCAN_TONE = { member: "ok", pending: "blue", join: "pink", unavailable: "pink", unknown: "muted" } as const;

/*
 * À côté de l'adhésion : son dernier relevé par le script (ce que montrait la page du
 * groupe), « changée il y a… » pendant une semaine, et « Vérifier » pour la relire.
 */
function MembershipScan({ g, now }: { g: FbGroup; now: number }) {
  const sc = g.membershipScan;
  const changed = g.membershipChangedAt && now - g.membershipChangedAt < 7 * DAY ? g.membershipChangedAt : null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {changed && (
        <span title={new Date(changed).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })}>
          <Pill tone="warn">changée {ago(changed, now)}</Pill>
        </span>
      )}
      {sc && (
        <span title={[`Relevé ${ago(sc.at, now)}`, sc.note].filter(Boolean).join(" · ")}>
          <Pill tone={MEMBERSHIP_SCAN_TONE[sc.state]}>{MEMBERSHIP_SCAN_LABELS[sc.state]}</Pill>
        </span>
      )}
      <FbVerifyMembership id={g.slug} url={g.groupUrl} />
    </span>
  );
}

/* ---------- Admins et modérateurs ---------- */

const REPLY_TONE = { replied: "ok", ongoing: "warn", silent: "muted", missing: "pink", unreadable: "muted" } as const;

/*
 * Qui tient le groupe, une personne par ligne : son profil, son rôle, et le suivi du
 * contact (la conversation, quand on lui a écrit, ce qu'on lui a écrit au survol, et sa
 * réponse au dernier relevé). Une liste vide le dit, pour qu'on sache qu'elle reste à
 * relever.
 *
 * Et dans les deux cas, le lien vers la page des admins du groupe (`staffUrl`, déduite).
 * C'est par là qu'on va quand la liste est vide, quand quelqu'un n'y figure pas encore,
 * ou quand il faut simplement écrire à un admin pour lui demander l'autorisation de
 * publier — ce que beaucoup de groupes exigent. Sans lui, il fallait rouvrir le groupe
 * et refaire le chemin à chaque fois.
 *
 * Dessous, le formulaire de la liste (`FbStaffEditor`), replié.
 */
function StaffLine({ g, now }: { g: FbGroup; now: number }) {
  const { staff, staffAt } = g;
  const url = staffUrl(g.groupUrl);
  const seeAll = url && (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-pill bg-paper px-2.5 py-1 font-bold hover:opacity-70">
      {staff.length === 0 ? "Aller les voir" : "Toute la liste"} <span className="text-subtle">↗</span>
    </a>
  );
  return (
    <div className="flex flex-col gap-2 text-xs font-semibold">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={staff.length ? "font-bold text-subtle" : "text-faint"} title={staffAt ? `Relevés ${ago(staffAt, now)}` : undefined}>
          Admins et modérateurs{staff.length ? "" : " : pas encore relevés"}
        </span>
        {seeAll}
      </div>
      {staff.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {staff.map((p) => {
            const key = staffKey(p);
            const reply = staffReplyState(p);
            const r = p.reply;
            return (
              <li key={key} className="flex flex-wrap items-center gap-2">
                {p.profileUrl ? (
                  <a href={p.profileUrl} target="_blank" rel="noreferrer" title="Ouvrir le profil" className="rounded-pill bg-paper px-2.5 py-1 hover:opacity-70">
                    {p.name} <span className="text-subtle">↗</span>
                  </a>
                ) : (
                  <span className="rounded-pill bg-paper px-2.5 py-1">{p.name}</span>
                )}
                <span className="text-subtle">{STAFF_LABELS[p.role].toLowerCase()}</span>
                {p.conversationUrl ? (
                  <>
                    <a href={p.conversationUrl} target="_blank" rel="noreferrer" className="rounded-pill bg-paper px-2.5 py-1 font-bold hover:opacity-70">
                      Conversation ↗
                    </a>
                    {p.contactedAt && (
                      <span className="text-subtle" title={p.contactMessage ?? "Message envoyé non noté"}>
                        écrit {ago(p.contactedAt, now)}
                      </span>
                    )}
                    {reply && r ? (
                      <span title={[`Relevé ${ago(r.at, now)}`, r.lastText && `dernier message : ${r.lastText}`, r.note].filter(Boolean).join(" · ")}>
                        <Pill tone={REPLY_TONE[reply]}>{STAFF_REPLY_LABELS[reply]}</Pill>
                        {staffAutoReply(p) && (
                          <span className="ml-1.5 text-subtle" title="Son dernier message ressemble à une réponse automatique de Page">
                            *réponse automatique
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-faint">réponse pas encore vérifiée</span>
                    )}
                    <FbVerifyStaff item={{ slug: g.slug, key, url: p.conversationUrl, name: p.name } satisfies StaffScanItem} />
                  </>
                ) : (
                  <span className="text-faint">pas contacté</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <details className="group/staff">
        <summary className="w-fit cursor-pointer list-none text-[0.6875rem] font-bold text-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open/staff:hidden">{staff.length ? "Modifier la liste ▸" : "Ajouter des admins ▸"}</span>
          <span className="hidden group-open/staff:inline">Replier ▾</span>
        </summary>
        <div className="mt-2 rounded-[18px] bg-paper p-3">
          {/* La clé remonte le formulaire quand la liste change en base : il repart de ce qui est enregistré. */}
          <FbStaffEditor key={JSON.stringify(staff.map((p) => [p.name, p.role, p.profileUrl, p.conversationUrl ?? ""]))} slug={g.slug} staff={staff} save={saveFbStaffAction} />
        </div>
      </details>
    </div>
  );
}

/* ---------- Le relevé du post ---------- */

const SCAN_TONE = { pending: "warn", validated: "ok", unavailable: "pink", unknown: "muted" } as const;

function ScanLine({ g, now }: { g: FbGroup; now: number }) {
  const sc = g.scan;
  const fresh = newComments(g);
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[0.8125rem]">
      <span className="text-xs font-bold text-subtle">Relevé</span>
      {sc ? (
        <>
          <span title={sc.note ?? undefined}>
            <Pill tone={SCAN_TONE[sc.state]}>{SCAN_LABELS[sc.state]}</Pill>
          </span>
          <span className="font-bold" title="Réactions">
            👍 {sc.likes === null ? "—" : fmt(sc.likes)}
          </span>
          <span className="font-bold" title="Commentaires">
            💬 {sc.comments === null ? "—" : fmt(sc.comments)}
            {fresh > 0 && <span className="ml-1 rounded-pill bg-tint-sand px-1.5 py-0.5 text-[0.6875rem] text-tint-sand-ink">dont {fresh} à lire</span>}
          </span>
          {fresh > 0 && (
            <ActionForm action={markFbSeenAction} submitLabel="Vu" submitTone="ghost" className={tiny}>
              <input type="hidden" name="slug" value={g.slug} />
            </ActionForm>
          )}
          <span className="text-xs font-semibold text-subtle">relevé {ago(sc.at, now)}</span>
        </>
      ) : (
        <span className="text-xs font-semibold text-faint">pas encore relevé</span>
      )}
      <FbVerify id={g.slug} url={g.postUrl!} />
    </div>
  );
}

/* ---------- Le détail d'un groupe ---------- */

const DEVICE_LABELS: Record<string, string> = { mobile: "Mobile", tablette: "Tablette", ordinateur: "Ordinateur" };

function GroupMetrics({ m }: { m: FbMetrics }) {
  const best = m.byDay.reduce((a, b) => (b.clicks > a.clicks ? b : a), m.byDay[0] ?? { day: "", clicks: 0 });
  const max = Math.max(1, ...m.byDay.map((d) => d.clicks));
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-3 max-[699px]:grid-cols-2">
        <MiniTile label="Clics humains" value={m.humans} />
        <MiniTile label="Robots écartés" value={m.robots} note={m.duplicates ? `+ ${m.duplicates} doublon${m.duplicates > 1 ? "s" : ""}` : undefined} />
        <MiniTile label="Meilleur jour" value={best.clicks} note={best.clicks ? dayLabel(best.day) : undefined} />
        <MiniTile label="Sources distinctes" value={m.byReferer.length} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Clics par jour · 30 jours</span>
        <div className="grid h-28 items-end gap-1 rounded-[14px] bg-paper p-3" style={{ gridAutoFlow: "column", gridAutoColumns: "minmax(0,1fr)" }}>
          {m.byDay.map((d) => (
            <div key={d.day} title={`${dayLabel(d.day)} : ${d.clicks} clic${d.clicks > 1 ? "s" : ""}`} className="flex h-full flex-col justify-end">
              <div className="rounded-t bg-ink" style={{ height: `${d.clicks ? Math.max(4, Math.round((d.clicks / max) * 100)) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs font-semibold text-subtle">
          <span>{m.byDay[0] && dayLabel(m.byDay[0].day)}</span>
          <span>{best.clicks ? `pic : ${best.clicks} le ${dayLabel(best.day)}` : "aucun clic sur la période"}</span>
          <span>{m.byDay.at(-1) && dayLabel(m.byDay.at(-1)!.day)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-[699px]:grid-cols-1">
        <Ranking title="Provenance" rows={m.byReferer} total={m.humans} bar="bg-ink" referers />
        <Ranking title="Navigateur" rows={m.byBrowser} total={m.humans} bar="bg-tint-green-ink" />
        <Ranking title="Système" rows={m.byOs} total={m.humans} bar="bg-tint-blue-ink" />
        <Ranking title="Appareil" rows={m.byDevice.map((r) => ({ ...r, key: DEVICE_LABELS[r.key] ?? r.key }))} total={m.humans} bar="bg-tint-sand-ink" />
        {m.byPage.length > 1 && <Ranking title="Page d'arrivée" rows={m.byPage} total={m.humans} bar="bg-tint-pink-ink" />}
      </div>

      <p className="text-xs font-semibold text-subtle">
        {m.first
          ? `Premier clic le ${new Date(m.first).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })} · dernier le ${new Date(m.last!).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })}.`
          : "Aucun clic enregistré pour l'instant."}{" "}
        Ne comptent ni les robots (qui n'exécutent pas la balise, ou se déclarent comme tels), ni deux clics du même visiteur à moins de 30 s, ni les administrateurs connectés et les adresses IP exclues dans Statistiques.
      </p>
    </div>
  );
}

function MiniTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] bg-paper p-4">
      <span className="text-xs font-bold text-subtle">{label}</span>
      <span className="text-[1.625rem] font-extrabold leading-none">{fmt(value)}</span>
      {note && <span className="text-xs font-semibold text-subtle">{note}</span>}
    </div>
  );
}

/*
 * Un classement en barres. La largeur est relative au PREMIER et non au total : avec un
 * total, une ligne à 8 % sur douze serait un trait invisible et le classement ne se lirait plus.
 */
function Ranking({ title, rows, total, bar, referers = false }: { title: string; rows: (Ranked & { urls?: { url: string; clicks: number }[] })[]; total: number; bar: string; referers?: boolean }) {
  const max = rows[0]?.clicks ?? 1;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">{title}</span>
      {rows.length === 0 && <p className="text-xs text-muted">Pas encore de données.</p>}
      {rows.slice(0, 10).map((r) => {
        const label = referers && r.key === DIRECT_KEY ? "Accès direct (ou origine masquée)" : r.key;
        // Le détail n'a de sens que là où il existe : une source qui n'envoie que son origine rend une seule adresse.
        const unfold = referers && r.urls && (r.urls.length > 1 || (r.urls[0] && /^https?:\/\/[^/]+\/./.test(r.urls[0].url)));
        const head = (
          <>
            <div className="flex justify-between gap-2 text-[0.8125rem]">
              <span className="truncate font-bold">
                {unfold && <span className="mr-1 text-subtle group-open:hidden">▸</span>}
                {unfold && <span className="mr-1 hidden text-subtle group-open:inline">▾</span>}
                {label}
              </span>
              <span className="shrink-0 font-extrabold">
                {fmt(r.clicks)} <span className="text-xs font-semibold text-subtle">· {total ? Math.round((r.clicks / total) * 100) : 0} %</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-line-soft">
              <div className={`h-full rounded-pill ${bar}`} style={{ width: `${Math.max(2, Math.round((r.clicks / max) * 100))}%` }} />
            </div>
          </>
        );
        return unfold ? (
          <details key={r.key} className="group">
            <summary className="flex cursor-pointer list-none flex-col gap-1.5 [&::-webkit-details-marker]:hidden">{head}</summary>
            <ul className="mt-1.5 flex flex-col gap-1 pl-4">
              {r.urls!.map((u) => (
                <li key={u.url} className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-subtle">{u.url}</span>
                  <span className="shrink-0 font-bold">{u.clicks}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <div key={r.key} className="flex flex-col gap-1.5">
            {head}
          </div>
        );
      })}
    </div>
  );
}
