import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { PublicationsForm } from "@/components/admin/PublicationsForm";
import { ButtonLink, FilterPills, GridTable, PageHeader, Pill, Tile, type PillTone } from "@/components/admin/ui";
import { campaignBoard, type BoardGroup, type BoardRow, type BoardStep, type StepState } from "@/lib/admin/campaign-board";
import { pendingRenewals } from "@/lib/promos/renewal";
import { completeCampaignAction } from "@/lib/admin/actions/campaigns";
import { markDeliveredAction } from "@/lib/admin/actions/orders";
import { ADMIN_STATUS_LABELS } from "@/lib/admin/order-ui";
import { clockNow, listAllCampaigns } from "@/lib/db/campaigns";
import { listContracts } from "@/lib/db/contracts";
import { listAllDeliverables } from "@/lib/db/deliverables";
import { listOperations } from "@/lib/db/operations";
import { getOrders } from "@/lib/db/orders";
import { listInfluencers } from "@/lib/db/promos";
import { COLLABORATION_LABELS } from "@/lib/domain/types";
import { OPERATION_STATE_LABELS, operationState, type OperationState } from "@/lib/promos/operation";

export const dynamic = "force-dynamic";

/*
 * Les campagnes, en deux onglets.
 *
 * « Suivi » répond à la question de tous les jours : où en est chaque partenaire, et
 * qu'est-ce qui m'attend ? Une ligne par participation en cours, cinq étapes lues d'un
 * coup d'œil, et ce qui se marque d'ici se marque d'ici — la réception d'un colis, les
 * parutions, la clôture. Ce que l'écran affiche n'est tenu à jour nulle part : tout se
 * déduit (voir `lib/admin/campaign-board.ts`).
 *
 * « Toutes les campagnes » regarde l'autre bout : ce qu'on organise une fois — un nom,
 * des dates, un kit, un contrat, une remise — et qu'on applique ensuite à plusieurs
 * partenaires d'un coup. Une campagne n'y compte que ses participants, jamais leurs
 * affaires.
 */

const STATE_TONE: Record<OperationState, "neutral" | "ok" | "muted"> = { upcoming: "neutral", live: "ok", over: "muted" };

/*
 * Le ton dit le camp, et rien d'autre. Le sable est réservé à ce qui dépend de nous :
 * c'est la seule couleur qui appelle un geste aujourd'hui, et la diluer sur ce qu'on
 * attend des autres reviendrait à ne plus la voir.
 */
const STEP_TONE: Record<Exclude<StepState, "none">, PillTone> = { done: "ok", ours: "warn", theirs: "neutral" };

const day = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

export default async function OperationsPage({ searchParams }: PageProps<"/admin/campagnes">) {
  const sp = await searchParams;
  const tab = sp.onglet === "liste" ? "liste" : "suivi";

  const [operations, campaigns, influencers, contracts, deliverables, at] = await Promise.all([
    listOperations(),
    listAllCampaigns(),
    listInfluencers(),
    listContracts(),
    listAllDeliverables(),
    clockNow(),
  ]);
  /* Seules les commandes de kit que les campagnes citent : inutile de lire les ventes. */
  const orders = await getOrders(campaigns.map((c) => c.kitOrderId)).catch(() => []);
  const board = campaignBoard({ operations, campaigns, influencers, contracts, orders, deliverables, now: at });
  /*
   * Qui redemande une campagne. La demande n'a pas de statut : elle se déduit de la
   * dernière campagne close et du moment où elle a été faite, si bien qu'ouvrir la
   * campagne suivante y répond d'elle-même (voir promos/renewal.ts).
   */
  const renewals = pendingRenewals(
    influencers.map((influencer) => ({ influencer, campaigns: campaigns.filter((c) => c.influencerId === influencer.id) })),
  );

  /* Une seule lecture des participations pour toute la liste. */
  const participants = new Map<string, { total: number; kits: number; signed: number }>();
  for (const c of campaigns) {
    if (!c.operationId) continue;
    const row = participants.get(c.operationId) ?? { total: 0, kits: 0, signed: 0 };
    row.total += 1;
    if (c.kitOrderId) row.kits += 1;
    if (c.signatureId) row.signed += 1;
    participants.set(c.operationId, row);
  }

  return (
    <>
      <PageHeader
        title="Campagnes"
        subtitle="Ce qu'on organise une fois — kit, contrat, remise, dates — et qu'on applique à plusieurs influenceurs"
        actions={
          <ButtonLink href="/admin/campagnes/nouvelle" tone="primary">
            + Nouvelle campagne
          </ButtonLink>
        }
      />

      <FilterPills
        items={[
          { href: "/admin/campagnes", label: "Suivi", count: board.totals.ours + board.totals.closable + renewals.length, active: tab === "suivi" },
          { href: "/admin/campagnes?onglet=liste", label: "Toutes les campagnes", count: operations.length, active: tab === "liste" },
        ]}
      />

      {tab === "suivi" ? <Board board={board} renewals={renewals} /> : <OperationsList operations={operations} participants={participants} at={at} />}
    </>
  );
}

/* ---------- Le suivi ---------- */

function Board({ board, renewals }: { board: ReturnType<typeof campaignBoard>; renewals: ReturnType<typeof pendingRenewals> }) {
  const { groups, totals } = board;
  /* Une campagne entièrement close ne fait plus une ligne par personne : une seule. */
  const running = groups.filter((g) => !g.allClosed);
  const finished = groups.filter((g) => g.allClosed);

  return (
    <>
      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile
          label="Participations en cours"
          value={totals.running}
          note={totals.operations > 0 ? `sur ${totals.operations} campagne${totals.operations > 1 ? "s" : ""}` : "aucune campagne ouverte"}
        />
        <Tile
          tone={totals.ours > 0 ? "sand" : "white"}
          label="À nous de jouer"
          value={totals.ours}
          note={totals.ours > 0 ? "colis à expédier, réceptions à confirmer, liens à récupérer" : "rien ne nous attend"}
        />
        <Tile
          label="On les attend"
          value={totals.theirs}
          note={totals.theirs > 0 ? "contrats, kits, parutions, fichiers" : "personne ne nous doit rien"}
        />
        <Tile
          tone={totals.closable > 0 ? "green" : "white"}
          label="À clore"
          value={totals.closable}
          note={totals.closable > 0 ? "tout est rendu, plus rien à attendre" : `${totals.closed} close${totals.closed > 1 ? "s" : ""} à ce jour`}
        />
      </div>

      {/*
        Ce qu'un partenaire demande après coup. Rien ne s'y règle : on lui ouvre sa
        prochaine campagne depuis sa fiche, et la demande s'éteint d'elle-même.
      */}
      {renewals.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-card bg-tint-blue px-6 py-5 text-tint-blue-ink">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em]">
            {renewals.length > 1 ? `${renewals.length} partenaires redemandent une campagne` : "Un partenaire redemande une campagne"}
          </span>
          <div className="flex flex-wrap gap-2">
            {renewals.map(({ influencer, renewal }) => (
              <Link
                key={influencer.id}
                href={`/admin/influenceurs/${influencer.id}?onglet=campagnes`}
                className="flex items-center gap-2 rounded-pill bg-white px-3.5 py-2 text-[0.8125rem] font-bold text-ink hover:opacity-70"
              >
                {influencer.name}
                <span className="font-semibold text-subtle">demandé le {day(renewal.askedAt)}</span>
              </Link>
            ))}
          </div>
          <span className="text-[0.6875rem] leading-relaxed">
            Leur dernière campagne est close et ils sont partants pour repartir. Ouvrez-leur une participation — depuis
            leur fiche, ou en les cochant sur une campagne : la demande disparaît d&apos;elle-même.
          </span>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="rounded-card bg-surface px-6 py-8 text-sm text-muted">
          Aucune participation. Créez une campagne, puis appliquez-la à vos influenceurs : chacun apparaîtra ici avec ce
          qu&apos;il reste à obtenir de lui.
        </p>
      ) : (
        running.map((group) => <GroupBoard key={group.operation?.id ?? "hors-campagne"} group={group} />)
      )}

      {/* Les campagnes dont plus personne ne doit rien : une ligne chacune, pas un tableau. */}
      {finished.length > 0 && (
        <div className="flex flex-col gap-1 rounded-card bg-surface px-6 py-4">
          <span className="pb-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Campagnes soldées</span>
          {finished.map((group) => (
            <div
              key={group.operation?.id ?? "hors-campagne"}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-[0.8125rem]"
            >
              {group.operation ? (
                <Link href={`/admin/campagnes/${group.operation.id}`} className="font-bold hover:opacity-70">
                  {group.operation.name} →
                </Link>
              ) : (
                <span className="font-bold">Hors campagne</span>
              )}
              <span className="text-[0.6875rem] text-subtle">
                {group.rows.length} participation{group.rows.length > 1 ? "s" : ""} close{group.rows.length > 1 ? "s" : ""} ·{" "}
                {group.rows.map((r) => r.influencerName).join(", ")}
              </span>
              <span className="ml-auto text-[0.6875rem] font-semibold text-subtle">
                dernière le {day(Math.max(...group.rows.map((r) => r.closedOn)))}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-subtle">
        Rien de ce tableau ne se tient à jour : chaque étape se déduit de ce qui existe déjà — le contrat signé, la
        commande du kit et son statut, les parutions constatées, les fichiers au dossier. Un état qu&apos;on ne maintient
        pas ne peut pas mentir. Ouvrez une ligne pour marquer ce qui dépend de vous ; le reste se règle sur la fiche de
        la participation.
      </p>
    </>
  );
}

function GroupBoard({ group }: { group: BoardGroup }) {
  const op = group.operation;
  const ours = group.rows.filter((r) => r.ours || r.closable).length;
  const closed = group.rows.filter((r) => r.closed).length;

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        {op ? (
          <>
            <Link href={`/admin/campagnes/${op.id}`} className="text-sm font-extrabold hover:opacity-70">
              {op.name} →
            </Link>
            {group.state && <Pill tone={STATE_TONE[group.state]}>{OPERATION_STATE_LABELS[group.state]}</Pill>}
            <span className="text-[0.6875rem] text-subtle">
              {COLLABORATION_LABELS[op.collaborationType]} · {day(op.startAt)} → {day(op.endAt)}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-extrabold">Hors campagne</span>
            <span className="text-[0.6875rem] text-subtle">montées pour une personne seule, ou dont la campagne a été supprimée</span>
          </>
        )}
        <span className="ml-auto text-[0.6875rem] font-semibold text-subtle">
          {group.rows.length - closed} en cours
          {closed > 0 && ` · ${closed} close${closed > 1 ? "s" : ""}`}
          {ours > 0 && ` · ${ours} à traiter`}
        </span>
      </header>

      <GridTable
        columns="minmax(150px,1.1fr) 104px 104px 116px 124px 124px minmax(170px,1.3fr)"
        head={["Partenaire", "Contrat", "Kit", "Colis", "Parutions", "Contenus", "Ce qu'il reste"]}
        empty="Personne."
        rows={group.rows.map((r) => ({
          key: r.campaign.id,
          cells: [
            <span key="p" className="flex min-w-0 items-center gap-2">
              {/* La ligne s'ouvre sur ce qui se marque : encore faut-il que ça se voie.
                  GridTable enveloppe la ligne dépliable dans un `group`. */}
              <span className="shrink-0 text-[0.625rem] text-faint transition-transform group-open:rotate-90">▶</span>
              <span className="flex min-w-0 flex-col">
                <span className={`truncate font-bold ${r.closed ? "text-muted" : ""}`}>{r.influencerName}</span>
                <span className="truncate text-[0.6875rem] text-subtle">{r.campaign.name || `Campagne n° ${r.campaign.seq}`}</span>
              </span>
            </span>,
            ...r.steps.map((s) => <Step key={s.key} step={s} />),
            r.closed ? (
              <span key="r" className="flex justify-end">
                <Pill tone="muted">Terminée le {day(r.closedOn)}</Pill>
              </span>
            ) : r.closable ? (
              <span key="r" className="flex justify-end">
                <Pill tone="ok">Tout est fait · à clore</Pill>
              </span>
            ) : (
              <span key="r" className={`block truncate text-[0.6875rem] font-semibold ${r.ours ? "text-ink" : "text-subtle"}`}>
                {r.remaining.length === 0 ? "Rien à relancer" : r.remaining.join(" · ")}
              </span>
            ),
          ],
          detail: <RowDetail row={r} />,
        }))}
      />
    </section>
  );
}

/** Une étape : son nom, son état. Rien à dire quand elle ne s'applique pas. */
function Step({ step }: { step: BoardStep }) {
  if (step.state === "none") {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-[0.6875rem] text-faint">—</span>
        {step.detail && <span className="truncate text-[0.625rem] text-faint">{step.detail}</span>}
      </span>
    );
  }
  return <Pill tone={STEP_TONE[step.state]}>{step.detail}</Pill>;
}

/*
 * Ce qui se marque d'ici : la réception d'un colis et les parutions. Deux gestes qu'on
 * fait en regardant la liste — « il l'a reçu », « le réel est sorti » — et qui ne
 * valaient pas d'ouvrir une fiche. Tout le reste y renvoie.
 */
function RowDetail({ row }: { row: BoardRow }) {
  const href = `/admin/influenceurs/${row.influencerId}/campagnes/${row.campaign.id}`;

  return (
    <div className="flex flex-col gap-3 rounded-card bg-paper px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={href} className="text-[0.8125rem] font-bold hover:opacity-70">
          Ouvrir la participation de {row.influencerName} →
        </Link>
        {row.order && (
          <Link href={`/admin/commandes/${row.order.id}`} className="text-[0.6875rem] font-semibold text-subtle underline hover:opacity-70">
            {row.order.number} · {ADMIN_STATUS_LABELS[row.order.status]}
          </Link>
        )}
      </div>

      {/* Le colis est parti (ou n'attend plus que de partir) : on constate qu'il est arrivé. */}
      {row.confirmable && (
        <ActionForm
          action={markDeliveredAction}
          submitLabel="Marquer reçu"
          submitTone="secondary"
          className="!gap-1.5 [&>div:last-child]:justify-start"
          footerNote={
            row.order?.status === "shipped"
              ? "Boxtal le fait tout seul quand il y a un suivi ; sans numéro, personne ne le dira à votre place."
              : "Le colis n'est pas encore marqué expédié : les étapes manquantes seront franchies et inscrites au journal de la commande."
          }
        >
          <input type="hidden" name="id" value={row.order?.id ?? ""} />
        </ActionForm>
      )}

      {/* Ce qui doit paraître, à cocher — le même formulaire que sur la fiche. */}
      {row.published.required ? (
        <div className="border-t border-line-soft pt-3">
          <PublicationsForm campaignId={row.campaign.id} slots={row.slots} hint={false} />
        </div>
      ) : (
        <p className="border-t border-line-soft pt-3 text-[0.6875rem] leading-relaxed text-subtle">
          {row.campaign.contractId
            ? "Le contrat n'énumère pas ce qui doit paraître : écrivez-le une fois en lignes dans Contrats, et toutes ses campagnes l'afficheront en cases à cocher."
            : "Aucun contrat n'est rattaché : il n'y a donc rien à publier de convenu."}
        </p>
      )}

      <p className="text-[0.6875rem] leading-relaxed text-subtle">
        {row.missing.agreed
          ? `Contenus : ${row.received.photos} photo${row.received.photos > 1 ? "s" : ""} sur ${row.expected.photos} · ${row.received.videos} vidéo${row.received.videos > 1 ? "s" : ""} sur ${row.expected.videos}. Les fichiers se déposent sur la participation.`
          : row.campaign.contractId
            ? "Personne n'a encore écrit ce que ce contrat réclame en fichiers : tant qu'il est à zéro, rien n'est décompté."
            : "Aucune quantité de fichiers n'est attendue."}
      </p>

      {/* Tout est fait : la clôture éteint le code et rend sa page au partenaire. */}
      {row.closable && (
        <ActionForm
          action={completeCampaignAction}
          submitLabel="Clore la campagne"
          submitTone="secondary"
          confirm={`Clore la campagne de ${row.influencerName} ? Son code continue de remiser jusqu'à la date annoncée.`}
          className="!gap-1.5 border-t border-line-soft pt-3 [&>div:last-child]:justify-start"
          footerNote={
            row.campaign.endAt
              ? `Plus rien n'est dû de part ni d'autre. Le code reste valable jusqu'au ${day(row.campaign.endAt)}.`
              : "Plus rien n'est dû de part ni d'autre."
          }
        >
          <input type="hidden" name="id" value={row.campaign.id} />
        </ActionForm>
      )}
    </div>
  );
}

/* ---------- Ce qu'on a organisé ---------- */

function OperationsList({
  operations,
  participants,
  at,
}: {
  operations: Awaited<ReturnType<typeof listOperations>>;
  participants: Map<string, { total: number; kits: number; signed: number }>;
  at: number;
}) {
  const live = operations.filter((op) => operationState(op, at) === "live");
  const engaged = operations.reduce((n, op) => n + (participants.get(op.id)?.total ?? 0), 0);
  const kits = operations.reduce((n, op) => n + (participants.get(op.id)?.kits ?? 0), 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-3 max-[899px]:grid-cols-1">
        <Tile label="En cours" value={live.length} note={live.length ? live.map((op) => op.name).join(", ") : "aucune campagne ouverte aujourd'hui"} tone="green" />
        <Tile label="Participations" value={engaged} note="partenaires engagés, toutes campagnes confondues" />
        <Tile label="Kits commandés" value={kits} note="sur ces participations" tone="sand" />
      </div>

      <GridTable
        columns="minmax(200px,2fr) 150px 110px 150px 90px 120px"
        head={["Campagne", "Période", "État", "Collaboration", "Remise", "Participants"]}
        empty="Aucune campagne. Créez-en une, puis appliquez-la à vos influenceurs."
        rows={operations.map((op) => {
          const state = operationState(op, at);
          const row = participants.get(op.id) ?? { total: 0, kits: 0, signed: 0 };
          return {
            key: op.id,
            href: `/admin/campagnes/${op.id}`,
            cells: [
              <span key="n" className="flex flex-col">
                <span className="font-bold">{op.name}</span>
                {op.kit.enabled && <span className="text-[0.6875rem] text-subtle">{op.kit.lines.reduce((n, l) => n + l.qty, 0)} livre(s) offerts</span>}
              </span>,
              <span key="p" className="text-[0.8125rem] text-subtle">
                {day(op.startAt)} → {day(op.endAt)}
              </span>,
              <Pill key="s" tone={STATE_TONE[state]}>
                {OPERATION_STATE_LABELS[state]}
              </Pill>,
              <span key="c" className="text-[0.8125rem]">
                {COLLABORATION_LABELS[op.collaborationType]}
              </span>,
              <span key="d" className="font-extrabold">
                {op.codeMode === "none" ? "—" : `−${op.discount} %`}
              </span>,
              <span key="x" className="flex flex-col">
                <span className="font-bold">{row.total}</span>
                {row.total > 0 && <span className="text-[0.6875rem] text-subtle">{row.kits} kit(s) partis</span>}
              </span>,
            ],
          };
        })}
      />

      <p className="text-xs leading-relaxed text-subtle">
        Un code promo appartient à une personne : chaque participant repart donc avec le sien — le sien d&apos;avant s&apos;il
        en avait un, sinon dérivé de son pseudo. La campagne, elle, ne fixe que la remise.
      </p>
    </>
  );
}
