import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { ContractPicker } from "@/components/admin/ContractPicker";
import { InfluencerPicker } from "@/components/admin/InfluencerPicker";
import { WelcomeKitEditor } from "@/components/admin/WelcomeKitEditor";
import { Card, Field, Input, PageHeader, Pill, Segmented, Select, Switch, Textarea } from "@/components/admin/ui";
import { applyOperationAction, deleteOperationAction, removeParticipantAction, saveOperationAction, saveParticipantCodesAction } from "@/lib/admin/actions/operations";
import { dayValue } from "@/lib/admin/campaign-form";
import { clockNow, listAllCampaigns, listCampaignsByOperation } from "@/lib/db/campaigns";
import { listContracts } from "@/lib/db/contracts";
import { getOperation } from "@/lib/db/operations";
import { listAllProducts } from "@/lib/db/products";
import { listInfluencers } from "@/lib/db/promos";
import { CAMPAIGN_STATUS_LABELS, COLLABORATION_LABELS, CollaborationType, OUTREACH_LABELS, type Campaign, type Operation } from "@/lib/domain/types";
import { liveCampaign } from "@/lib/promos/campaign";
import { manualPlaceholders } from "@/lib/promos/contract-template";
import { OPERATION_STATE_LABELS, operationState } from "@/lib/promos/operation";

export const dynamic = "force-dynamic";

/*
 * Une campagne, en pleine page.
 *
 * À gauche, ce qu'on organise : les dates, la remise, le contrat, le kit. À droite, à
 * qui on l'applique — et ce que chacun en a fait. Cocher des influenceurs leur ouvre à
 * chacun une PARTICIPATION (une campagne au sens de db/campaigns.ts), avec son propre
 * code : un code promo appartient à une personne, il ne se mutualise pas.
 *
 * Ce qui est écrit ici ne redescend PAS sur les participations déjà ouvertes : chacune
 * suit son cours, kit commandé puis contrat signé, et rien ne doit pouvoir réécrire par
 * surprise ce qu'un partenaire a déjà accepté. On les règle une par une, sur leur page.
 */

const STATUS_TONE = { draft: "neutral", active: "ok", completed: "muted", cancelled: "warn" } as const;
const STATE_TONE = { upcoming: "neutral", live: "ok", over: "muted" } as const;

const BLANK: Operation = {
  id: "",
  name: "",
  collaborationType: "UGC",
  startAt: 0,
  endAt: 0,
  discount: 10,
  codeMode: "partner",
  contractId: "",
  contractVariables: {},
  kit: { enabled: false, title: "Votre kit de bienvenue", text: "", lines: [], deductStock: false, prototype: false },
  note: "",
  createdAt: 0,
  updatedAt: 0,
};

export default async function OperationPage({ params }: PageProps<"/admin/campagnes/[id]">) {
  const { id } = await params;
  const creating = id === "nouvelle";
  const operation = creating ? BLANK : await getOperation(id);
  if (!operation) notFound();

  const [products, contracts, participants, influencers, allCampaigns, at] = await Promise.all([
    listAllProducts(),
    listContracts(),
    creating ? Promise.resolve([] as Campaign[]) : listCampaignsByOperation(id),
    listInfluencers(),
    creating ? Promise.resolve([] as Campaign[]) : listAllCampaigns(),
    clockNow(),
  ]);

  /* Un contrat retiré n'est plus proposable, sauf s'il est déjà celui de la campagne. */
  const choices = contracts.filter((c) => c.active || c.id === operation.contractId);
  const state = creating ? "upcoming" : operationState(operation, at);
  const byId = new Map(influencers.map((i) => [i.id, i]));
  const engaged = new Set(participants.map((c) => c.influencerId));

  /*
   * Ce que chaque candidat a déjà sur le feu : on le montre pour ne pas lui ouvrir une
   * deuxième campagne en même temps — son espace ne lui en propose qu'une à la fois.
   */
  const busy = new Map<string, string>();
  for (const inf of influencers) {
    const current = liveCampaign(allCampaigns.filter((c) => c.influencerId === inf.id).sort((a, b) => b.seq - a.seq));
    if (current) busy.set(inf.id, current.name || `Campagne n° ${current.seq}`);
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/campagnes", label: "Campagnes" }}
        title={
          creating ? (
            "Nouvelle campagne"
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {operation.name}
              <Pill tone={STATE_TONE[state]}>{OPERATION_STATE_LABELS[state]}</Pill>
            </span>
          )
        }
        subtitle={
          creating
            ? "Décidez d'abord ce qu'elle contient ; les influenceurs s'y ajoutent ensuite."
            : `${COLLABORATION_LABELS[operation.collaborationType]} · ${participants.length} participant${participants.length > 1 ? "s" : ""}`
        }
      />

      <div className="grid grid-cols-2 items-start gap-3 max-[1199px]:grid-cols-1">
        {/* ---------- Ce qui est décidé une fois ---------- */}
        <Card title="Ce qui est convenu">
          <ActionForm action={saveOperationAction} submitLabel={creating ? "Créer la campagne" : "Enregistrer la campagne"}>
            {!creating && <input type="hidden" name="id" value={operation.id} />}
            <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
              <Field label="Nom de la campagne" hint="Il devient celui de chaque participation." name="name">
                <Input name="name" required maxLength={80} defaultValue={operation.name} placeholder="Lancement automne" />
              </Field>
              <Field label="Collaboration" hint="Détermine le contrat proposé." name="collaborationType">
                <Select name="collaborationType" defaultValue={operation.collaborationType}>
                  {CollaborationType.options.map((t) => (
                    <option key={t} value={t}>
                      {COLLABORATION_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* ---------- Quand ---------- */}
            <div className="grid grid-cols-2 gap-2.5 max-[749px]:grid-cols-1">
              <Field label="Début de la campagne" name="startAt">
                <Input name="startAt" type="date" required defaultValue={dayValue(operation.startAt || undefined)} />
              </Field>
              <Field label="Fin de la campagne" hint="Passée cette date, les codes ne remisent plus rien." name="endAt">
                <Input name="endAt" type="date" required defaultValue={dayValue(operation.endAt || undefined)} />
              </Field>
            </div>

            {/* ---------- Les codes ---------- */}
            {/*
              Un code appartient à une personne (`promos/<CODE>` porte un influencerId) :
              la campagne ne fixe que la remise, chaque participant repart avec le sien.
            */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-subtle">Code promo des participants</span>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Segmented
                    name="codeMode"
                    defaultValue={operation.codeMode}
                    options={[
                      { value: "partner", label: "Un code par partenaire" },
                      { value: "none", label: "Aucun code" },
                    ]}
                  />
                </div>
                <span className="flex items-center rounded-xl bg-paper px-3">
                  <input name="discount" type="number" min={0} max={100} defaultValue={operation.discount} className="w-10 bg-transparent py-3 text-right text-sm font-extrabold outline-none" />
                  <span className="text-[0.8125rem] font-extrabold">%</span>
                </span>
              </div>
              <span className="text-[0.6875rem] leading-relaxed text-subtle">
                Le code de chacun est repris du sien s&apos;il en avait un, sinon dérivé de son pseudo et de la remise
                (MARIE10). Sans code, seuls les liens de suivi attribuent les ventes.
              </span>
            </div>

            <ContractPicker
              contracts={choices.map((c) => ({
                id: c.id,
                label: `${c.name} · ${c.version}`,
                keys: manualPlaceholders(`${c.summary}\n${c.body}`).sort(),
                defaults: c.variables,
              }))}
              initialId={operation.contractId}
              overrides={operation.contractVariables}
              fieldClassName="w-full rounded-xl border border-line bg-paper px-3 py-3 text-[0.8125rem]"
              labelClassName="text-xs font-semibold text-subtle"
            />

            {/* ---------- Le kit ---------- */}
            <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
              <span className="text-xs font-semibold text-subtle">Kit de bienvenue</span>
              <p className="-mt-1 text-[0.6875rem] leading-relaxed text-subtle">
                Les livres offerts à chaque participant. Chacun commande le sien depuis son espace, en donnant son
                adresse ou un point relais ; les commandes arrivent dans « À expédier ».
              </p>
              <Switch name="enabled" label="Proposer le kit dans leur espace" defaultChecked={operation.kit.enabled} />
              <Switch
                name="deductStock"
                label="Décompter du stock de vente"
                hint="Par défaut non : le kit vient d'un stock à part réservé aux influenceurs."
                defaultChecked={operation.kit.deductStock}
              />
              <Switch
                name="prototype"
                label="Ce sont des prototypes"
                hint="Ajoute une mention discrète dans leur espace : les livres reçus ne sont pas les exemplaires définitifs."
                defaultChecked={operation.kit.prototype}
              />
              <Field label="Titre de l'encart" name="title">
                <Input name="title" defaultValue={operation.kit.title} placeholder="Votre kit de bienvenue" />
              </Field>
              <Field label="Texte" hint="Deux phrases au plus : ce qu'il reçoit et sous quel délai." name="text">
                <Textarea name="text" defaultValue={operation.kit.text} placeholder="Trois imagiers à découvrir, à filmer, à offrir. Expédié sous 48 h." />
              </Field>
              <WelcomeKitEditor
                products={products.map((p) => ({ slug: p.slug, title: p.title, image: p.images[0]?.url, tint: p.tint, stock: p.stock }))}
                initial={operation.kit.lines}
              />

              <Field label="Note interne" hint="Pour vous seul : jamais montrée aux partenaires." name="note" className="border-t border-line-soft pt-3">
                <Textarea name="note" defaultValue={operation.note} placeholder="Budget, objectifs, qui relancer…" />
              </Field>
            </div>
          </ActionForm>
        </Card>

        {/* ---------- À qui on l'applique ---------- */}
        <div className="flex flex-col gap-3">
          {creating ? (
            <Card title={<span className="text-sm">Participants</span>} className="!gap-2">
              <span className="text-[0.8125rem] text-subtle">
                Créez d&apos;abord la campagne : vous pourrez ensuite y ajouter autant d&apos;influenceurs que vous voulez,
                d&apos;un seul geste.
              </span>
            </Card>
          ) : (
            <>
              <Card title={<span className="text-sm">Participants ({participants.length})</span>} className="!gap-2">
                {participants.length === 0 ? (
                  <span className="text-[0.8125rem] text-subtle">Personne pour l&apos;instant. Cochez des influenceurs ci-dessous.</span>
                ) : (
                  <>
                    <div className="flex flex-col divide-y divide-line-soft">
                      {participants
                        .sort((a, b) => (byId.get(a.influencerId)?.name ?? "").localeCompare(byId.get(b.influencerId)?.name ?? ""))
                        .map((c) => {
                          const inf = byId.get(c.influencerId);
                          const removable = !c.kitOrderId && !c.signatureId;
                          return (
                            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0">
                              <Link href={`/admin/influenceurs/${c.influencerId}/campagnes/${c.id}`} className="min-w-0 flex-1 text-[0.8125rem] font-bold hover:opacity-70">
                                {inf?.name ?? "Partenaire supprimé"} →
                              </Link>
                              {/*
                                Son code à lui, modifiable ici. Le champ est rattaché par
                                `form=` au formulaire posé plus bas : il ne peut pas être
                                DANS ce formulaire, puisque la ligne porte déjà celui du
                                bouton « Retirer » — deux <form> ne s'imbriquent pas.
                              */}
                              {operation.codeMode === "none" ? (
                                <span className="text-[0.6875rem] text-faint">sans code</span>
                              ) : (
                                <input
                                  form="participant-codes"
                                  name={`code:${c.id}`}
                                  defaultValue={c.code}
                                  maxLength={24}
                                  pattern="[A-Za-z0-9]{2,24}"
                                  placeholder="sans code"
                                  aria-label={`Code promo de ${inf?.name ?? "ce partenaire"}`}
                                  className="w-28 rounded-lg bg-paper px-2 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] outline-none placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-faint focus-visible:outline-2 focus-visible:outline-ink"
                                />
                              )}
                              <Pill tone={STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABELS[c.status]}</Pill>
                              <span className="text-[0.6875rem] text-subtle">
                                {c.kitOrderId ? "kit commandé" : c.kit.enabled ? "kit à commander" : "sans kit"}
                                {c.signatureId ? " · signé" : c.contractId ? " · à signer" : ""}
                              </span>
                              {removable && (
                                <ActionForm
                                  action={removeParticipantAction}
                                  submitLabel="Retirer"
                                  submitTone="ghost"
                                  confirm={`Retirer ${inf?.name ?? "ce partenaire"} de la campagne ? Rien n'en a encore découlé.`}
                                  className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-[0.6875rem] [&_button]:text-accent"
                                >
                                  <input type="hidden" name="id" value={c.id} />
                                  <input type="hidden" name="operationId" value={operation.id} />
                                </ActionForm>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {operation.codeMode !== "none" && (
                      <ActionForm
                        id="participant-codes"
                        action={saveParticipantCodesAction}
                        submitLabel="Enregistrer les codes"
                        submitTone="secondary"
                        className="!gap-0 border-t border-line-soft pt-2 [&>div:last-child]:justify-start"
                        footerNote="Un code par partenaire : c'est lui qui lui attribue ses ventes."
                      >
                        <input type="hidden" name="operationId" value={operation.id} />
                      </ActionForm>
                    )}
                  </>
                )}
              </Card>

              <Card title={<span className="text-sm">Appliquer à des influenceurs</span>} className="!gap-2">
                <ActionForm action={applyOperationAction} submitLabel="Ouvrir leurs participations">
                  <input type="hidden" name="operationId" value={operation.id} />
                  <InfluencerPicker
                    options={influencers
                      .filter((i) => !engaged.has(i.id))
                      .map((i) => ({
                        id: i.id,
                        name: i.name,
                        note: [i.handle, i.platform, OUTREACH_LABELS[i.outreach]].filter(Boolean).join(" · "),
                        state: busy.get(i.id),
                      }))}
                  />
                  <p className="text-[0.6875rem] leading-relaxed text-subtle">
                    Chacun reçoit sa propre participation : son code, son kit à commander, son contrat à signer. Le code
                    proposé n&apos;est qu&apos;un point de départ — il se corrige juste au-dessus, partenaire par
                    partenaire. Un influenceur qui a déjà une campagne en cours (colonne de droite) ne verra celle-ci
                    qu&apos;une fois l&apos;autre terminée : son espace n&apos;en propose qu&apos;une à la fois.
                  </p>
                </ActionForm>
              </Card>

              <Card title={<span className="text-sm">Après coup</span>} className="!gap-2">
                <span className="text-[0.6875rem] leading-relaxed text-subtle">
                  Modifier cette campagne ne touche pas les participations déjà ouvertes : ce qu&apos;un partenaire a vu,
                  commandé ou signé ne se réécrit pas derrière lui. Pour changer le kit ou les dates de quelqu&apos;un,
                  ouvrez sa participation.
                </span>
                {participants.length === 0 && (
                  <ActionForm
                    action={deleteOperationAction}
                    submitLabel="Supprimer cette campagne"
                    submitTone="ghost"
                    confirm="Supprimer cette campagne ? Personne n'y participe, elle ne laisse pas de trace."
                    className="!gap-0 border-t border-line-soft pt-2 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent"
                  >
                    <input type="hidden" name="id" value={operation.id} />
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
