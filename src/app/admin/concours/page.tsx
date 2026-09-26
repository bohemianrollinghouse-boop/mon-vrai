import { ButtonLink, GridTable, PageHeader, Pill, Tile } from "@/components/admin/ui";
import { CONTEST_STATE_LABELS, contestState, seatsLeft, shared, totalParticipants, type ContestState } from "@/lib/contests/state";
import { clockNow } from "@/lib/db/campaigns";
import { listContests } from "@/lib/db/contests";
import { CONTEST_PLATFORM_LABELS } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Les concours : ceux qu'on monte seul, et ceux qu'on monte avec d'autres créateurs.
 * Les deux sont le même objet — la colonne « Avec » dit lesquels sont partagés.
 *
 * Ce que l'écran cherche à montrer d'abord, c'est ce qui attend quelque chose de nous :
 * un tirage dont la date est passée, un lot qui n'est pas parti. Le reste se lit.
 */

const STATE_TONE: Record<ContestState, "neutral" | "ok" | "warn" | "muted"> = {
  draft: "muted",
  upcoming: "neutral",
  live: "ok",
  drawing: "warn",
  shipping: "warn",
  closed: "muted",
};

const day = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

export default async function ContestsPage() {
  const [contests, at] = await Promise.all([listContests(), clockNow()]);

  const states = new Map(contests.map((c) => [c.id, contestState(c, at)]));
  const live = contests.filter((c) => states.get(c.id) === "live");
  const todo = contests.filter((c) => states.get(c.id) === "drawing" || states.get(c.id) === "shipping");
  const prizesOut = contests.reduce((n, c) => n + c.winners.filter((w) => w.orderId).length, 0);

  return (
    <>
      <PageHeader
        title="Concours"
        subtitle="Ce qu'on met en jeu, seul ou avec d'autres créateurs — et à qui le lot est parti"
        actions={
          <ButtonLink href="/admin/concours/nouveau" tone="primary">
            + Nouveau concours
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-3 gap-3 max-[899px]:grid-cols-1">
        <Tile label="En cours" value={live.length} note={live.length ? live.map((c) => c.name).join(", ") : "aucun concours ouvert aujourd'hui"} tone="green" />
        <Tile
          label="En attente"
          value={todo.length}
          note={todo.length ? "tirage à faire ou lot à envoyer" : "rien n'attend de vous"}
          tone={todo.length ? "sand" : "white"}
        />
        <Tile label="Lots partis" value={prizesOut} note="commandes offertes, tous concours confondus" />
      </div>

      <GridTable
        columns="minmax(200px,2fr) 150px 130px 150px 120px 110px"
        head={["Concours", "Période", "État", "Avec", "Lot", "Gagnants"]}
        empty="Aucun concours. Créez-en un : le lot, les dates, et les créateurs qui l'annoncent avec vous."
        rows={contests.map((c) => {
          const state = states.get(c.id) ?? "draft";
          const books = c.prize.lines.reduce((n, l) => n + l.qty, 0);
          const people = totalParticipants(c);
          return {
            key: c.id,
            href: `/admin/concours/${c.id}`,
            cells: [
              <span key="n" className="flex flex-col">
                <span className="font-bold">{c.name}</span>
                <span className="text-[0.6875rem] text-subtle">
                  {CONTEST_PLATFORM_LABELS[c.platform]}
                  {people > 0 && ` · ${people} participant${people > 1 ? "s" : ""}`}
                </span>
              </span>,
              <span key="p" className="text-[0.8125rem] text-subtle">
                {day(c.startAt)} → {day(c.endAt)}
              </span>,
              <Pill key="s" tone={STATE_TONE[state]}>
                {CONTEST_STATE_LABELS[state]}
              </Pill>,
              <span key="a" className="text-[0.8125rem]">
                {shared(c) ? (
                  <span className="flex flex-col">
                    <span className="truncate">{c.hosts.map((h) => h.name).join(", ")}</span>
                    <span className="text-[0.6875rem] text-subtle">{c.hosts.length} créateur{c.hosts.length > 1 ? "s" : ""}</span>
                  </span>
                ) : (
                  <span className="text-subtle">Mes réseaux</span>
                )}
              </span>,
              <span key="l" className="flex flex-col">
                <span className="font-semibold">{books > 0 ? `${books} livre${books > 1 ? "s" : ""}` : "—"}</span>
                {c.prize.extra && <span className="truncate text-[0.6875rem] text-subtle">{c.prize.extra}</span>}
              </span>,
              <span key="g" className="flex flex-col">
                <span className="font-bold">
                  {c.winners.length}/{c.winnersWanted}
                </span>
                {c.winners.length > 0 && (
                  <span className="text-[0.6875rem] text-subtle">{c.winners.filter((w) => w.orderId).length} lot(s) partis</span>
                )}
                {seatsLeft(c) > 0 && c.winners.length > 0 && <span className="text-[0.6875rem] text-subtle">{seatsLeft(c)} à tirer</span>}
              </span>,
            ],
          };
        })}
      />

      <p className="text-xs leading-relaxed text-subtle">
        Un concours publié apparaît dans l&apos;espace des co-organisateurs qui ont une fiche partenaire : ils y lisent ce
        qui est convenu, y déclarent leur gagnant et y disent ce que leur publication a donné. Un créateur invité sans
        fiche ne voit rien — c&apos;est vous qui tenez ses chiffres.
      </p>
    </>
  );
}
