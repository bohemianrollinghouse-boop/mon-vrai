import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { ButtonLink, Card, Field, Input, PageHeader, Pill, Select, Switch, Textarea } from "@/components/admin/ui";
import { deleteContractAction, saveContractAction } from "@/lib/admin/actions/contracts";
import { listContracts } from "@/lib/db/contracts";
import { listAllCampaigns } from "@/lib/db/campaigns";
import { CollaborationType, COLLABORATION_LABELS, type Contract } from "@/lib/domain/types";
import { manualPlaceholders, placeholdersIn } from "@/lib/promos/contract-template";
import { AUTOMATIC_PLACEHOLDERS, VARIABLE_HELP, variableLabel } from "@/lib/promos/contract-variables";

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
  const [contracts, campaigns] = await Promise.all([listContracts(), listAllCampaigns()]);
  const isNew = wanted === "nouveau";
  const current = isNew ? null : contracts.find((c) => c.id === wanted) ?? contracts[0] ?? null;

  /* Combien de campagnes dépendent de chaque contrat : on ne supprime pas à l'aveugle. */
  const used = new Map<string, number>();
  for (const c of campaigns) if (c.contractId) used.set(c.contractId, (used.get(c.contractId) ?? 0) + 1);

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
                  {count > 0 && ` · ${count} campagne${count > 1 ? "s" : ""}`}
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
              {current && !isNew && <AutomaticVariables contract={current} />}
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
  const empty = keys.filter((k) => !contract.variables[k]?.trim());
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-subtle">Variables de ce contrat</span>
      {/* Une variable vide se lit « — » dans le contrat : mieux vaut le signaler ici. */}
      {empty.length > 0 && (
        <p className="rounded-xl bg-tint-sand px-4 py-3 text-[0.8125rem] leading-relaxed font-semibold text-tint-sand-ink">
          {empty.length} rubrique{empty.length > 1 ? "s" : ""} sans valeur ({empty.map(variableLabel).join(", ")}). Elle{empty.length > 1 ? "s" : ""}{" "}
          disparaîtra{empty.length > 1 ? "ont" : ""} du contrat — sauf au milieu d&apos;une phrase, ou si la case ci-dessous est cochée, auquel cas on
          lira « non défini ».
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 max-[899px]:grid-cols-1">
        {keys.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-[0.8125rem] font-bold">{variableLabel(key)}</span>
            {VARIABLE_HELP[key]?.hint && <span className="text-[0.6875rem] leading-relaxed text-subtle">{VARIABLE_HELP[key].hint}</span>}
            <Input
              name={`var:${key}`}
              defaultValue={contract.variables[key] ?? ""}
              placeholder={VARIABLE_HELP[key]?.example ?? ""}
              className="!rounded-xl !py-2.5 !text-[0.8125rem]"
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-[0.6875rem] text-subtle">
              <input type="checkbox" name={`req:${key}`} defaultChecked={contract.requiredVariables.includes(key)} className="h-3.5 w-3.5 accent-black" />
              <span>Faire figurer la rubrique même sans valeur</span>
            </label>
            <span className="font-mono text-[0.625rem] text-faint">{`{{${key}}}`}</span>
          </div>
        ))}
      </div>
      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        Laissée vide, une variable fait disparaître sa rubrique du contrat, intitulé compris. Cochez la case pour que la
        rubrique figure quand même, avec « non défini ». Au milieu d&apos;une phrase, la rubrique ne peut pas disparaître
        sans perdre la clause : on lit alors « non défini » quoi qu&apos;il arrive. L&apos;identité du signataire, ses
        comptes, les livres offerts, leur valeur et la date d&apos;acceptation se remplissent tout seuls.
      </span>
    </div>
  );
}

/*
 * Les variables que le site remplit tout seul. Elles ne sont pas saisissables — les
 * montrer évite de croire qu'on a oublié de les renseigner : voir vingt `{{…}}` dans
 * le texte et quatre champs en dessous prête à confusion.
 */
function AutomaticVariables({ contract }: { contract: Contract }) {
  const auto = new Set<string>(AUTOMATIC_PLACEHOLDERS);
  const used = placeholdersIn(`${contract.summary}\n${contract.body}`).filter((k) => auto.has(k));
  if (used.length === 0) return null;
  return (
    <details className="rounded-xl bg-paper p-3">
      <summary className="cursor-pointer text-xs font-semibold text-subtle">
        {used.length} variables remplies automatiquement — rien à saisir
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        {used.sort().map((key) => (
          <span key={key} className="flex flex-col">
            <span className="text-[0.8125rem] font-semibold">{variableLabel(key)}</span>
            <span className="text-[0.6875rem] leading-relaxed text-subtle">
              {VARIABLE_HELP[key]?.hint ?? "Remplie au moment de la signature."}
            </span>
            <span className="font-mono text-[0.625rem] text-faint">{`{{${key}}}`}</span>
          </span>
        ))}
      </div>
    </details>
  );
}
