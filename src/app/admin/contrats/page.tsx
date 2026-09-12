import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { ButtonLink, Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea } from "@/components/admin/ui";
import { deleteContractAction, saveContractAction } from "@/lib/admin/actions/contracts";
import { listContracts } from "@/lib/db/contracts";
import { listInfluencers } from "@/lib/db/promos";
import { CollaborationType, COLLABORATION_LABELS, type Contract } from "@/lib/domain/types";
import { manualPlaceholders } from "@/lib/promos/contract-template";

export const dynamic = "force-dynamic";

/*
 * Contrats de collaboration : la liste à gauche, l'éditeur à droite. `?id=` choisit un
 * contrat, `?id=nouveau` ouvre un formulaire vide.
 *
 * Un contrat signé ne se modifie pas rétroactivement — la signature en garde une copie
 * figée. Changer le texte ici ne vaut donc que pour les signatures à venir, et c'est
 * pourquoi la version est un champ à part entière, dont l'unicité est vérifiée.
 */
export default async function ContractsPage({ searchParams }: PageProps<"/admin/contrats">) {
  const sp = await searchParams;
  const wanted = typeof sp.id === "string" ? sp.id : "";
  const [contracts, influencers] = await Promise.all([listContracts(), listInfluencers()]);
  const isNew = wanted === "nouveau";
  const current = isNew ? null : contracts.find((c) => c.id === wanted) ?? contracts[0] ?? null;

  /* Combien de partenaires dépendent de chaque contrat : on ne supprime pas à l'aveugle. */
  const used = new Map<string, number>();
  for (const inf of influencers) if (inf.contractId) used.set(inf.contractId, (used.get(inf.contractId) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Le contrat qu'un partenaire signe avant de recevoir son kit. Chaque version est conservée telle qu'elle a été acceptée."
        actions={
          <ButtonLink href="/admin/contrats?id=nouveau" tone="primary">
            + Nouveau contrat
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-[300px_1fr] items-start gap-3 max-[1099px]:grid-cols-1">
        <div className="flex flex-col gap-2">
          {contracts.length === 0 && <p className="rounded-card bg-surface p-6 text-sm text-muted">Aucun contrat. Créez le premier à droite.</p>}
          {contracts.map((c) => {
            const count = used.get(c.id) ?? 0;
            return (
              <Link
                key={c.id}
                href={`/admin/contrats?id=${c.id}`}
                className={`flex flex-col gap-1.5 rounded-[20px] border-[1.5px] bg-surface px-5 py-4 ${current?.id === c.id && !isNew ? "border-ink" : "border-transparent hover:opacity-80"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[0.8125rem] font-bold">{c.name}</span>
                  <Pill tone={c.active ? "ok" : "muted"}>{COLLABORATION_LABELS[c.type]}</Pill>
                </span>
                <span className="text-[0.6875rem] text-subtle">
                  {c.version}
                  {count > 0 && ` · ${count} partenaire${count > 1 ? "s" : ""}`}
                  {!c.active && " · retiré"}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <Card title={isNew || !current ? "Nouveau contrat" : current.name}>
            <ActionForm key={isNew ? "new" : current?.id ?? "none"} action={saveContractAction} submitLabel={current && !isNew ? "Enregistrer" : "Créer le contrat"}>
              <input type="hidden" name="id" value={current && !isNew ? current.id : ""} />
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 max-[899px]:grid-cols-1">
                <Field label="Nom" hint="Tel qu'il apparaît au signataire." name="name">
                  <Input name="name" required defaultValue={current && !isNew ? current.name : ""} placeholder="Collaboration UGC Mon Vrai" className="!font-bold" />
                </Field>
                <Field label="Type de collaboration" name="type">
                  <Select name="type" defaultValue={current && !isNew ? current.type : "UGC"}>
                    {CollaborationType.options.map((t) => (
                      <option key={t} value={t}>
                        {COLLABORATION_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Version" hint="Ne se réutilise jamais : elle identifie ce qui a été signé." name="version">
                  <Input name="version" required defaultValue={current && !isNew ? current.version : ""} placeholder="UGC-2026-09-v1" />
                </Field>
              </div>

              <Switch
                name="active"
                label="Proposable aux partenaires"
                hint="Retiré : plus attribuable à personne, mais les signatures passées restent valables."
                defaultChecked={current && !isNew ? current.active : true}
              />

              <Field
                label="Résumé — « Votre collaboration »"
                hint="Les engagements en clair, affichés au-dessus du contrat. Une ligne par engagement ; elles deviennent une liste à puces."
                name="summary"
              >
                <Textarea name="summary" rows={7} defaultValue={current && !isNew ? current.summary : ""} placeholder={"40 photographies originales\n20 vidéos de 5 à 15 secondes\nLivres réellement manipulés, fichiers sans filigrane"} />
              </Field>

              <Field
                label="Contrat intégral"
                hint="Le texte complet. « # » et « ## » pour les titres, « ** » autour d'un passage en gras, « * » en début de ligne pour une puce. Les variables s'écrivent {{COMME_CECI}}."
                name="body"
              >
                <Textarea name="body" rows={22} defaultValue={current && !isNew ? current.body : ""} className="!font-mono !text-xs" placeholder="Article 1 — Objet…" />
              </Field>

              {/*
                Les variables de campagne sont détectées dans le texte : pas de liste à
                tenir à jour ici, et l'on ne demande jamais celles qui se calculent
                (identité du signataire, livres reçus, valeur, date d'acceptation).
              */}
              {current && !isNew && <ContractVariables contract={current} />}
            </ActionForm>
          </Card>

          {current && !isNew && (
            <Card title={<span className="text-sm">Zone dangereuse</span>} className="!gap-2 border border-danger-bg">
              {(used.get(current.id) ?? 0) > 0 ? (
                <p className="text-xs leading-relaxed text-subtle">
                  {used.get(current.id)} partenaire{(used.get(current.id) ?? 0) > 1 ? "s dépendent" : " dépend"} de ce contrat. Détachez-les d'abord, ou
                  retirez simplement le contrat avec l'interrupteur ci-dessus — les signatures passées resteront intactes.
                </p>
              ) : (
                <ActionForm
                  action={deleteContractAction}
                  submitLabel="Supprimer ce contrat"
                  submitTone="ghost"
                  confirm={`Supprimer « ${current.name} » (${current.version}) ? Les signatures déjà données en gardent une copie figée et ne sont pas touchées.`}
                  className="!gap-0 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent"
                >
                  <input type="hidden" name="id" value={current.id} />
                </ActionForm>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/*
 * Les variables propres à la campagne, telles qu'elles apparaissent dans le contrat.
 * Une variable non remplie n'est pas laissée en accolades sous les yeux du signataire :
 * elle devient un tiret — ce que dit l'aide sous les champs.
 */
function ContractVariables({ contract }: { contract: Contract }) {
  const keys = manualPlaceholders(`${contract.summary}\n${contract.body}`).sort();
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-subtle">Variables de ce contrat</span>
      <div className="grid grid-cols-2 gap-2.5 max-[899px]:grid-cols-1">
        {keys.map((key) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="font-mono text-[0.6875rem] text-faint">{`{{${key}}}`}</span>
            <Input name={`var:${key}`} defaultValue={contract.variables[key] ?? ""} className="!rounded-xl !py-2.5 !text-[0.8125rem]" />
          </label>
        ))}
      </div>
      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        Laissée vide, une variable s'affiche en tiret dans le contrat. L'identité du signataire, ses comptes, les livres
        offerts, leur valeur et la date d'acceptation se remplissent tout seuls — ils ne sont pas listés ici.
      </span>
    </div>
  );
}
