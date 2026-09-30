import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { InfluencerPicker } from "@/components/admin/InfluencerPicker";
import { WelcomeKitEditor } from "@/components/admin/WelcomeKitEditor";
import { Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea } from "@/components/admin/ui";
import {
  addContestHostsAction,
  deleteContestAction,
  removeContestHostAction,
  publishContestAction,
  removeWinnerAction,
  saveContestAction,
  saveWinnerAction,
  shipPrizeAction,
} from "@/lib/admin/actions/contests";
import { dayValue } from "@/lib/admin/campaign-form";
import { kitChoices } from "@/lib/admin/kit-choices";
import { shippingOptions } from "@/lib/checkout/quote";
import { CONTEST_STATE_LABELS, awaitingReview, contestState, hostOf, prizeSaid, seatsLeft, shippable } from "@/lib/contests/state";
import { clockNow } from "@/lib/db/campaigns";
import { getContest } from "@/lib/db/contests";
import { listAllProducts } from "@/lib/db/products";
import { listInfluencers } from "@/lib/db/promos";
import { getSettings } from "@/lib/db/settings";
import { CONTEST_PLATFORM_LABELS, ContestPlatform, type Contest, type ContestWinner } from "@/lib/domain/types";
import { kitItems, kitWeightG } from "@/lib/promos/kit";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";

export const dynamic = "force-dynamic";

/*
 * Un concours, en pleine page.
 *
 * À gauche, ce qui est en jeu : le lot, les dates, la mécanique, le règlement. À droite,
 * avec qui on le monte et qui a gagné — les deux seules choses qui bougent une fois le
 * concours lancé.
 *
 * Le lot d'un gagnant part comme un kit : une commande offerte, à 0 €, qu'on expédie
 * ensuite depuis /admin/commandes. On ne la crée qu'une fois l'adresse connue, et jamais
 * deux fois pour le même gagnant.
 */

const STATE_TONE = { draft: "muted", upcoming: "neutral", live: "ok", drawing: "warn", shipping: "warn", closed: "muted" } as const;

const BLANK: Contest = {
  id: "",
  name: "",
  platform: "instagram",
  startAt: 0,
  endAt: 0,
  mechanic: "",
  rules: "",
  prize: { lines: [], extra: "", deductStock: false },
  winnersWanted: 1,
  hosts: [],
  hostInfluencerIds: [],
  winners: [],
  published: false,
  proposedBy: "",
  postUrl: "",
  participants: 0,
  note: "",
  createdAt: 0,
  updatedAt: 0,
};

const shortDay = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default async function ContestPage({ params }: PageProps<"/admin/concours/[id]">) {
  const { id } = await params;
  const creating = id === "nouveau";
  const contest = creating ? BLANK : await getContest(id);
  if (!contest) notFound();

  const [products, influencers, settings, at] = await Promise.all([listAllProducts(), listInfluencers(), getSettings(), clockNow()]);

  /* Les titres du lot, avec ce qu'il reste à promettre — ce concours-ci mis à part : sa
     propre promesse ne doit pas se retrancher de ce qu'il peut promettre. */
  const kitBooks = await kitChoices(products, creating ? undefined : contest.id);

  const state = creating ? "draft" : contestState(contest, at);
  const items = kitItems(contest.prize, products);
  const books = items.reduce((n, i) => n + i.qty, 0);
  const engaged = new Set(contest.hosts.map((h) => h.influencerId).filter(Boolean));
  /* Qui l'a proposé : son nom est déjà dans `hosts`, il s'y monte lui-même comme co-organisateur. */
  const proposer = contest.proposedBy ? contest.hosts.find((h) => h.id === contest.proposedBy) : null;

  /*
   * Les modes de livraison proposés pour un lot : à domicile seulement. Le gagnant a
   * donné son adresse, pas un point relais — et il n'y a pas de carte à lui montrer.
   * Le poids est celui du lot, pour que l'offre Boxtal soit celle du vrai colis.
   */
  const weight = Math.max(1, settings.shipping.parcel.baseWeightG + kitWeightG(items));
  const homeOptions = shippingOptions(settings.shipping.rates, bracketIndexForWeight(weight), true, true).filter((o) => !o.relay);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/concours", label: "Concours" }}
        title={
          creating ? (
            "Nouveau concours"
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {contest.name}
              <Pill tone={STATE_TONE[state]}>{CONTEST_STATE_LABELS[state]}</Pill>
              {awaitingReview(contest) && <Pill tone="warn">À valider</Pill>}
            </span>
          )
        }
        subtitle={
          creating
            ? "Le lot et les dates d'abord ; les créateurs et les gagnants s'ajoutent ensuite."
            : `${CONTEST_PLATFORM_LABELS[contest.platform]} · ${shortDay(contest.startAt)} → ${shortDay(contest.endAt)} · ${
                contest.hosts.length ? `avec ${contest.hosts.map((h) => h.name).join(", ")}` : "sur mes réseaux"
              }`
        }
      />

      <div className="grid grid-cols-2 items-start gap-3 max-[1199px]:grid-cols-1">
        {/* ---------- Ce qui est en jeu ---------- */}
        <Card title="Ce qui est en jeu">
          {/*
            Une proposition de partenaire : il a écrit les dates et la mécanique, il
            manque ce qu'il ne décide pas. Dit ici, en tête du formulaire, parce que
            c'est ici que les deux gestes se font.
          */}
          {awaitingReview(contest) && (
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-tint-sand px-4 py-3 text-[0.8125rem] leading-relaxed text-tint-sand-ink">
              <p>
                <strong className="font-bold">{proposer?.name ?? "Un partenaire"}</strong> a monté ce concours depuis son
                espace. Il ne pourra déclarer son gagnant qu&apos;une fois le concours en ligne.
              </p>
              {/*
                La validation se fait ICI, là où elle est annoncée, et pas seulement par
                l'interrupteur du bas : une proposition n'attend de nous qu'un geste, et
                le chercher au milieu de tout ce qui se règle revient à ne pas l'avoir.
                Le bouton ne paraît qu'une fois le lot posé — c'est ce que la publication
                exige, autant le dire avant le clic qu'après.
              */}
              {prizeSaid(contest.prize) ? (
                <ActionForm action={publishContestAction} submitLabel="Publier le concours" className="!gap-0">
                  <input type="hidden" name="id" value={contest.id} />
                </ActionForm>
              ) : (
                <p className="font-semibold">
                  Posez d&apos;abord le lot ci-dessous, puis enregistrez : le bouton « Publier le concours » paraîtra
                  ici.
                </p>
              )}
            </div>
          )}
          <ActionForm action={saveContestAction} submitLabel={creating ? "Créer le concours" : "Enregistrer le concours"}>
            {!creating && <input type="hidden" name="id" value={contest.id} />}
            <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
              <Field label="Nom du concours" hint="Pour s'y retrouver : « Jeu de la rentrée »." name="name">
                <Input name="name" required maxLength={80} defaultValue={contest.name} placeholder="Jeu de la rentrée" />
              </Field>
              <Field label="Où il a lieu" name="platform">
                <Select name="platform" defaultValue={contest.platform}>
                  {ContestPlatform.options.map((p) => (
                    <option key={p} value={p}>
                      {CONTEST_PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-2.5 max-[749px]:grid-cols-1">
              <Field label="Ouverture" name="startAt">
                <Input name="startAt" type="date" required defaultValue={dayValue(contest.startAt || undefined)} />
              </Field>
              <Field label="Tirage" hint="Dernier jour pour participer." name="endAt">
                <Input name="endAt" type="date" required defaultValue={dayValue(contest.endAt || undefined)} />
              </Field>
              <Field label="Gagnants" hint="Autant de lots." name="winnersWanted">
                <Input name="winnersWanted" type="number" min={1} max={50} defaultValue={contest.winnersWanted} />
              </Field>
            </div>

            {/* ---------- Le lot ---------- */}
            <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
              <span className="text-xs font-semibold text-subtle">Le lot</span>
              <p className="-mt-1 text-[0.6875rem] leading-relaxed text-subtle">
                Un seul lot pour tout le concours : chaque gagnant reçoit le même. Son départ crée une commande offerte,
                à 0 €, expédiable comme les autres.
              </p>
              <WelcomeKitEditor
                products={kitBooks}
                initial={contest.prize.lines}
                note="Ces exemplaires sont pris sur le stock influence (voir /admin/stocks), pas sur les livres à vendre, et la commande du lot vaut 0 € (jamais facturée)."
              />
              <Field label="Et, hors catalogue" hint="Ce qui ne part pas d'ici : un bon d'achat, un objet d'un autre créateur." name="extra">
                <Input name="extra" maxLength={200} defaultValue={contest.prize.extra} placeholder="Un tote bag du partenaire" />
              </Field>
              <Switch
                name="deductStock"
                label="Décompter du stock de vente"
                hint="Par défaut non : le lot est pris sur le stock influence (/admin/stocks)."
                defaultChecked={contest.prize.deductStock}
              />
            </div>

            {/* ---------- Ce qu'on en dit ---------- */}
            <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
              <span className="text-xs font-semibold text-subtle">Ce qu'on en dit</span>
              <Field label="Mécanique" hint="Ce qu'il faut faire pour participer. Montré aux co-organisateurs, à recopier." name="mechanic">
                <Textarea name="mechanic" rows={3} defaultValue={contest.mechanic} placeholder="S'abonner aux deux comptes, aimer la publication, identifier une personne en commentaire." />
              </Field>
              <Field label="Règlement" hint="Le texte, ou son adresse. Jeu sans obligation d'achat." name="rules">
                <Textarea name="rules" rows={3} defaultValue={contest.rules} placeholder="Jeu gratuit sans obligation d'achat, ouvert en France métropolitaine…" />
              </Field>
            </div>

            {/* ---------- Nos propres chiffres ---------- */}
            <div className="grid grid-cols-2 gap-2.5 border-t border-line-soft pt-3 max-[749px]:grid-cols-1">
              <Field label="Notre publication" hint="L'adresse du post, pour la retrouver." name="postUrl">
                <Input name="postUrl" maxLength={300} defaultValue={contest.postUrl} placeholder="https://instagram.com/p/…" />
              </Field>
              <Field label="Participants (chez nous)" hint="Les co-organisateurs déclarent les leurs." name="participants">
                <Input name="participants" type="number" min={0} defaultValue={contest.participants} />
              </Field>
            </div>

            <Switch
              name="published"
              label="Publier auprès des co-organisateurs"
              hint="Tant que c'est fermé, le concours se prépare et ne se lit que d'ici."
              defaultChecked={contest.published}
            />

            <Field label="Note interne" hint="Pour vous seul : jamais montrée aux co-organisateurs." name="note">
              <Textarea name="note" defaultValue={contest.note} placeholder="Budget, ce qu'on attend, qui relancer…" />
            </Field>
          </ActionForm>
        </Card>

        {/* ---------- Avec qui, et qui a gagné ---------- */}
        <div className="flex flex-col gap-3">
          {creating ? (
            <Card title={<span className="text-sm">Co-organisateurs et gagnants</span>} className="!gap-2">
              <span className="text-[0.8125rem] text-subtle">
                Créez d&apos;abord le concours : vous pourrez ensuite y ajouter des créateurs, et déclarer les gagnants le
                jour du tirage.
              </span>
            </Card>
          ) : (
            <>
              {/* ---------- Les co-organisateurs ---------- */}
              <Card title={<span className="text-sm">Co-organisateurs ({contest.hosts.length})</span>} className="!gap-2">
                {contest.hosts.length === 0 ? (
                  <span className="text-[0.8125rem] text-subtle">
                    Personne : ce concours est sur vos seuls réseaux. Cochez des partenaires ci-dessous pour le monter à
                    plusieurs.
                  </span>
                ) : (
                  <div className="flex flex-col divide-y divide-line-soft">
                    {contest.hosts.map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0">
                        <span className="flex min-w-0 flex-1 flex-col">
                          {h.influencerId ? (
                            <Link href={`/admin/influenceurs/${h.influencerId}`} className="truncate text-[0.8125rem] font-bold hover:opacity-70">
                              {h.name} →
                            </Link>
                          ) : (
                            <span className="truncate text-[0.8125rem] font-bold">{h.name}</span>
                          )}
                          <span className="truncate text-[0.6875rem] text-subtle">
                            {h.handle || "sans pseudo"}
                            {h.id === contest.proposedBy
                              ? " · a proposé ce concours"
                              : h.influencerId
                                ? " · voit le concours dans son espace"
                                : " · invité, ne voit rien"}
                            {h.participants > 0 && ` · ${h.participants} participant${h.participants > 1 ? "s" : ""}`}
                            {h.followers !== 0 && ` · ${h.followers > 0 ? "+" : ""}${h.followers} abonnés`}
                          </span>
                          {h.postUrl && (
                            <a href={h.postUrl} target="_blank" rel="noreferrer noopener" className="truncate text-[0.6875rem] text-subtle underline">
                              {h.postUrl.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </span>
                        <ActionForm
                          action={removeContestHostAction}
                          submitLabel="Retirer"
                          submitTone="ghost"
                          confirm={`Retirer ${h.name} de ce concours ? Ses gagnants, s'il en a déclaré, restent à servir.`}
                          className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-[0.6875rem] [&_button]:text-accent"
                        >
                          <input type="hidden" name="contestId" value={contest.id} />
                          <input type="hidden" name="hostId" value={h.id} />
                        </ActionForm>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title={<span className="text-sm">Ajouter des créateurs</span>} className="!gap-2" collapsible defaultOpen={contest.hosts.length === 0}>
                <ActionForm action={addContestHostsAction} submitLabel="Ajouter au concours">
                  <input type="hidden" name="contestId" value={contest.id} />
                  <InfluencerPicker
                    options={influencers
                      .filter((i) => !engaged.has(i.id))
                      .map((i) => ({ id: i.id, name: i.name, note: [i.handle, i.platform].filter(Boolean).join(" · "), state: i.active ? undefined : "En pause" }))}
                  />
                  <div className="grid grid-cols-2 gap-2.5 border-t border-line-soft pt-3 max-[749px]:grid-cols-1">
                    <Field label="Ou un créateur invité" hint="Sans fiche partenaire : il ne verra pas le concours." name="guestName">
                      <Input name="guestName" maxLength={80} placeholder="Camille Dupont" />
                    </Field>
                    <Field label="Son pseudo" name="guestHandle">
                      <Input name="guestHandle" maxLength={80} placeholder="@camille" />
                    </Field>
                  </div>
                </ActionForm>
              </Card>

              {/* ---------- Les gagnants ---------- */}
              <Card
                title={
                  <span className="text-sm">
                    Gagnants ({contest.winners.length}/{contest.winnersWanted})
                  </span>
                }
                aside={seatsLeft(contest) > 0 ? <span className="text-xs font-bold text-subtle">{seatsLeft(contest)} lot(s) à attribuer</span> : undefined}
                className="!gap-2"
              >
                {contest.winners.length === 0 ? (
                  <span className="text-[0.8125rem] text-subtle">
                    Aucun gagnant déclaré. Vous pouvez en déclarer un ci-dessous ; un co-organisateur partenaire peut le
                    faire depuis son espace.
                  </span>
                ) : (
                  <div className="flex flex-col divide-y divide-line-soft">
                    {contest.winners.map((w) => (
                      <WinnerRow key={w.id} contest={contest} winner={w} books={books} homeOptions={homeOptions.map((o) => ({ id: o.id, name: o.name }))} />
                    ))}
                  </div>
                )}
              </Card>

              {seatsLeft(contest) > 0 && (
                <Card title={<span className="text-sm">Déclarer un gagnant</span>} className="!gap-2" collapsible defaultOpen={contest.winners.length === 0}>
                  <ActionForm action={saveWinnerAction} submitLabel="Déclarer ce gagnant">
                    <input type="hidden" name="contestId" value={contest.id} />
                    <WinnerFields contest={contest} />
                    <p className="text-[0.6875rem] leading-relaxed text-subtle">
                      L&apos;adresse peut attendre : déclarez le gagnant maintenant, complétez-la quand il l&apos;aura
                      donnée. Le lot ne part qu&apos;une fois l&apos;adresse et l&apos;e-mail connus.
                    </p>
                  </ActionForm>
                </Card>
              )}

              <Card title={<span className="text-sm">Après coup</span>} className="!gap-2">
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  Le lot parti devient une commande offerte : c&apos;est de là qu&apos;on demande son étiquette, et c&apos;est
                  elle qui inscrit le port dans les dépenses. Corriger une adresse après le départ se fait sur la
                  commande, pas ici.
                </span>
                {!contest.winners.some((w) => w.orderId) && (
                  <ActionForm
                    action={deleteContestAction}
                    submitLabel="Supprimer ce concours"
                    submitTone="ghost"
                    confirm="Supprimer ce concours ? Aucun lot n'est parti, il ne laisse pas de trace."
                    className="!gap-0 border-t border-line-soft pt-2 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent"
                  >
                    <input type="hidden" name="id" value={contest.id} />
                  </ActionForm>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/*
 * Les champs d'un gagnant, partagés par la déclaration et la correction : les deux
 * postent la même action, et doivent donc demander exactement la même chose.
 */
function WinnerFields({ contest, winner }: { contest: Contest; winner?: ContestWinner }) {
  const a = winner?.address;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
        <Field label="Pseudo du gagnant" hint="Tel qu'il apparaît sur le réseau." name="handle">
          <Input name="handle" maxLength={80} defaultValue={winner?.handle ?? ""} placeholder="@marie.lit" />
        </Field>
        <Field label="Tiré par" hint="Sur quels réseaux il a joué." name="hostId">
          <Select name="hostId" defaultValue={winner?.hostId ?? ""}>
            <option value="">Mes réseaux</option>
            {contest.hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
        <Field label="Nom et prénom" hint="Celui du colis." name="name">
          <Input name="name" maxLength={120} defaultValue={winner?.name ?? ""} placeholder="Marie Martin" />
        </Field>
        <Field label="E-mail" hint="Pour le suivi du colis." name="email">
          <Input name="email" type="email" maxLength={160} defaultValue={winner?.email ?? ""} placeholder="marie@exemple.fr" />
        </Field>
      </div>
      <Field label="Adresse" name="address.line1">
        <Input name="address.line1" maxLength={160} defaultValue={a?.line1 ?? ""} placeholder="12 rue des Lilas" />
      </Field>
      <Field label="Complément" name="address.line2">
        <Input name="address.line2" maxLength={160} defaultValue={a?.line2 ?? ""} placeholder="Bâtiment B, 3e étage" />
      </Field>
      <div className="grid grid-cols-3 gap-2.5 max-[749px]:grid-cols-1">
        <Field label="Code postal" name="address.postalCode">
          <Input name="address.postalCode" maxLength={12} defaultValue={a?.postalCode ?? ""} placeholder="69003" />
        </Field>
        <Field label="Ville" name="address.city">
          <Input name="address.city" maxLength={80} defaultValue={a?.city ?? ""} placeholder="Lyon" />
        </Field>
        <Field label="Pays" name="address.country">
          <Input name="address.country" maxLength={2} defaultValue={a?.country ?? "FR"} placeholder="FR" />
        </Field>
      </div>
      <Field label="Téléphone" hint="Demandé par certains transporteurs." name="address.phone">
        <Input name="address.phone" maxLength={30} defaultValue={a?.phone ?? ""} placeholder="06 12 34 56 78" />
      </Field>
      <Field label="Note" hint="Pour vous : ce qu'il a dit, ce qu'il reste à faire." name="note">
        <Input name="note" maxLength={500} defaultValue={winner?.note ?? ""} placeholder="Relancé le 12 pour son adresse" />
      </Field>
    </>
  );
}

/*
 * Un gagnant dans la liste : qui il est, où il en est, et le seul geste qui compte —
 * envoyer son lot. Trois formulaires côte à côte, jamais imbriqués : deux <form> ne
 * s'emboîtent pas, et la correction vit donc dans un <details> à part.
 */
function WinnerRow({
  contest,
  winner,
  books,
  homeOptions,
}: {
  contest: Contest;
  winner: ContestWinner;
  books: number;
  homeOptions: { id: string; name: string }[];
}) {
  const host = hostOf(contest, winner);
  const canShip = shippable(winner, books);
  const who = winner.handle || winner.name || "Gagnant";

  return (
    <div className="flex flex-col gap-1.5 py-2.5 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-[0.8125rem] font-bold">{who}</span>
        {winner.orderId ? (
          <Pill tone="ok">Lot parti</Pill>
        ) : winner.address ? (
          <Pill tone="neutral">À envoyer</Pill>
        ) : (
          <Pill tone="warn">Adresse manquante</Pill>
        )}
        {winner.declaredBy === "partner" && <span className="text-[0.6875rem] text-subtle">déclaré par {host?.name ?? "un partenaire"}</span>}
      </div>

      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        {host ? `Tiré par ${host.name}` : "Tiré sur mes réseaux"} · {new Date(winner.declaredAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
        {winner.email && ` · ${winner.email}`}
        {winner.address && ` · ${winner.address.postalCode} ${winner.address.city}`}
      </span>
      {winner.note && <span className="text-[0.6875rem] text-subtle">{winner.note}</span>}

      {winner.orderId ? (
        <Link href={`/admin/commandes/${winner.orderId}`} className="w-fit text-[0.6875rem] font-bold underline">
          Voir la commande du lot
        </Link>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <ActionForm
            action={shipPrizeAction}
            submitLabel="Envoyer le lot"
            submitTone={canShip ? "primary" : "outline"}
            className="!gap-2 [&>div:last-child]:justify-start"
            footerNote={
              canShip
                ? undefined
                : books === 0
                  ? "Le lot ne contient aucun livre du catalogue."
                  : !winner.address
                    ? "Complétez l'adresse ci-dessous."
                    : "Complétez l'e-mail ci-dessous."
            }
          >
            <input type="hidden" name="contestId" value={contest.id} />
            <input type="hidden" name="winnerId" value={winner.id} />
            <div className="flex items-center gap-2">
              <Select name="rateId" defaultValue={homeOptions[0]?.id ?? ""} disabled={!canShip} className="!w-auto !py-2 text-xs">
                {homeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
              <span className="text-[0.6875rem] text-subtle">à domicile</span>
            </div>
          </ActionForm>

          <ActionForm
            action={removeWinnerAction}
            submitLabel="Retirer"
            submitTone="ghost"
            confirm={`Retirer ${who} ? Sa place sera de nouveau à prendre.`}
            className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-[0.6875rem] [&_button]:text-accent"
          >
            <input type="hidden" name="contestId" value={contest.id} />
            <input type="hidden" name="winnerId" value={winner.id} />
          </ActionForm>
        </div>
      )}

      <details className="group">
        <summary className="w-fit cursor-pointer list-none text-[0.6875rem] font-bold underline [&::-webkit-details-marker]:hidden">
          Corriger ses informations
        </summary>
        <div className="pt-2">
          <ActionForm action={saveWinnerAction} submitLabel="Enregistrer" submitTone="secondary">
            <input type="hidden" name="contestId" value={contest.id} />
            <input type="hidden" name="winnerId" value={winner.id} />
            <WinnerFields contest={contest} winner={winner} />
            {winner.orderId && (
              <p className="text-[0.6875rem] text-subtle">
                Le lot est parti : l&apos;adresse se corrige maintenant sur la commande, pas ici.
              </p>
            )}
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
