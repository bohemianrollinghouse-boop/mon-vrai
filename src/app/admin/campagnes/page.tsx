import { ButtonLink, GridTable, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { clockNow, listAllCampaigns } from "@/lib/db/campaigns";
import { listOperations } from "@/lib/db/operations";
import { COLLABORATION_LABELS } from "@/lib/domain/types";
import { OPERATION_STATE_LABELS, operationState, type OperationState } from "@/lib/promos/operation";

export const dynamic = "force-dynamic";

/*
 * Les campagnes : ce qu'on organise une fois — un nom, des dates, un kit, un contrat,
 * une remise — et qu'on applique ensuite à plusieurs partenaires d'un coup.
 *
 * Ce que chacun en fait, lui, est sa PARTICIPATION : elle vit sur sa fiche, avec son
 * code, son kit commandé et son contrat signé. Une campagne ne compte donc ici que ses
 * participants, jamais leurs affaires.
 */

const STATE_TONE: Record<OperationState, "neutral" | "ok" | "muted"> = { upcoming: "neutral", live: "ok", over: "muted" };

const day = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

export default async function OperationsPage() {
  const [operations, campaigns, at] = await Promise.all([listOperations(), listAllCampaigns(), clockNow()]);

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

  const live = operations.filter((op) => operationState(op, at) === "live");
  const engaged = operations.reduce((n, op) => n + (participants.get(op.id)?.total ?? 0), 0);
  const kits = operations.reduce((n, op) => n + (participants.get(op.id)?.kits ?? 0), 0);

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
