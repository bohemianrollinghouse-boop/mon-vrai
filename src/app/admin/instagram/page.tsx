import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, Field, Input, Notice, PageHeader, Pill, Segmented, Switch, Textarea, Tile } from "@/components/admin/ui";
import { boardState, eventLine, reallySent, ruleSummary, shadowWarning } from "@/lib/admin/instagram-board";
import {
  connectInstagramAction,
  disconnectInstagramAction,
  resubscribeAction,
  saveIgRulesAction,
  saveIgSettingsAction,
  testIgRuleAction,
} from "@/lib/admin/actions/instagram";
import { listEvents, publicView } from "@/lib/db/instagram";
import { tokenLabel, type IgRule } from "@/lib/domain/instagram";
import { IG_SCOPES, instagramConfigured, instagramRedirectUri, webhookVerifyToken } from "@/lib/instagram/client";

export const dynamic = "force-dynamic";

/*
 * Réponses automatiques Instagram.
 *
 * Ce que cet écran NE peut pas faire, et qu'il faut avoir en tête avant de le lire :
 * écrire à un nouvel abonné. Meta ne laisse écrire qu'à quelqu'un qui a engagé la
 * conversation — un message reçu ouvre 24 h, un commentaire ouvre 7 jours et donne
 * droit à UNE réponse privée. Tout le reste du dossier découle de là, et c'est
 * pourquoi la carte « Ce que Meta autorise » est sur la page plutôt que dans un coin
 * de documentation : c'est la question qu'on se repose à chaque nouvelle idée.
 */

const when = (ts: number) =>
  ts ? new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/* Deux lignes vierges au bas de la liste : ajouter une règle ne doit pas demander un clic d'abord. */
const BLANKS = 2;

export default async function InstagramPage({ searchParams }: PageProps<"/admin/instagram">) {
  const sp = await searchParams;
  const [view, events] = await Promise.all([publicView(), listEvents(40)]);

  const configured = instagramConfigured();
  const state = boardState(view.settings, view.connected);
  const warning = shadowWarning(view.rules);
  const missing = IG_SCOPES.filter((s) => view.scopes.length > 0 && !view.scopes.includes(s));

  const one = (k: "ok" | "erreur" | "avertissement") => (typeof sp[k] === "string" ? sp[k] : "");

  return (
    <>
      <PageHeader
        title="Instagram"
        subtitle="Répondre automatiquement aux commentaires et aux messages reçus. Les réponses partent en votre nom depuis le compte connecté."
      />

      {one("ok") && <Notice tone="ok">Compte @{one("ok")} connecté.</Notice>}
      {one("erreur") && <Notice tone="error">{one("erreur")}</Notice>}
      {one("avertissement") && (
        <Notice tone="info">
          Compte connecté, mais l&apos;abonnement aux notifications a échoué : {one("avertissement")}. Utilisez « Réabonner » ci-dessous.
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-3 max-[899px]:grid-cols-2 max-[599px]:grid-cols-1">
        <Tile tone={state.tone} label="État" value={state.label} note={state.note} />
        <Tile label="Compte" value={view.connected ? `@${view.username || "—"}` : "Aucun"} note={view.connected ? tokenLabel(view.expiresAt, view.at) : "non connecté"} />
        <Tile label="Règles actives" value={view.rules.filter((r) => r.enabled).length} note={`${view.rules.length} au total`} />
        <Tile label="Réponses parties" value={reallySent(events)} note={`sur les ${events.length} derniers événements`} />
      </div>

      {/* ---------- Ce que Meta autorise ---------- */}

      <Card title="Ce que Meta autorise, et ce qu'il n'autorise pas" tone="blue">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-[0.8125rem] leading-relaxed">
          <li>
            <strong>Répondre à un commentaire</strong> : en public sous la publication, et en privé — le commentaire part
            en message direct. Une seule réponse privée par commentaire, dans les 7 jours.
          </li>
          <li>
            <strong>Répondre à un message reçu</strong> : dans les 24 heures qui suivent le message de la personne.
          </li>
          <li>
            <strong>Écrire à un nouvel abonné : impossible.</strong> On ne peut écrire qu&apos;à quelqu&apos;un qui a
            engagé la conversation. Les outils qui promettent le contraire passent par de l&apos;automatisation non
            officielle, et c&apos;est ce qui fait fermer des comptes.
          </li>
          <li>
            Une réponse publique est elle-même un commentaire, que Meta nous renvoie aussitôt. Les commentaires venant de
            notre propre compte sont donc <strong>ignorés d&apos;office</strong> — sans quoi le dispositif se répondrait à
            lui-même sans fin.
          </li>
        </ul>
      </Card>

      {/* ---------- Le compte ---------- */}

      <Card
        title="Le compte connecté"
        aside={view.connected ? <Pill tone="ok">@{view.username}</Pill> : <Pill tone="neutral">Non connecté</Pill>}
      >
        {!configured && (
          <Notice tone="error">
            Les clés de l&apos;application Meta sont absentes du serveur (INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET).
            La connexion est impossible tant qu&apos;elles ne sont pas déployées.
          </Notice>
        )}

        {view.connected ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 text-[0.8125rem] max-[749px]:grid-cols-1">
              <p>
                <span className="text-subtle">Identifiant du compte</span>
                <br />
                <code className="text-xs">{view.igUserId}</code>
              </p>
              <p>
                <span className="text-subtle">Connecté le</span>
                <br />
                {when(view.connectedAt)} — {tokenLabel(view.expiresAt, view.at)}
              </p>
            </div>
            {missing.length > 0 && (
              <Notice tone="error">
                Permissions refusées au consentement : {missing.join(", ")}. Reconnectez le compte en les acceptant,
                sinon les réponses échoueront.
              </Notice>
            )}
            <p className="text-xs leading-relaxed text-subtle">
              Le jeton se renouvelle tout seul à chaque notification reçue. Un compte qui ne reçoit rien pendant deux
              mois perd sa connexion : il suffit alors de la refaire.
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionForm action={resubscribeAction} submitLabel="Réabonner aux notifications" submitTone="secondary">
                <input type="hidden" name="$intent" value="resubscribe" />
              </ActionForm>
              <ActionForm
                action={disconnectInstagramAction}
                submitLabel="Déconnecter"
                submitTone="danger"
                confirm="Déconnecter le compte Instagram ? Les réponses automatiques s'arrêteront."
              >
                <input type="hidden" name="$intent" value="disconnect" />
              </ActionForm>
            </div>
          </>
        ) : (
          <form action={connectInstagramAction}>
            <Button type="submit" disabled={!configured}>
              Connecter mon compte Instagram
            </Button>
          </form>
        )}

        {/* Ce qu'il faut recopier dans le tableau de bord Meta — et qu'on cherche sinon partout. */}
        <details className="rounded-[14px] bg-paper px-4 py-3">
          <summary className="cursor-pointer text-[0.8125rem] font-bold">À déclarer dans l&apos;application Meta</summary>
          <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed">
            <p>
              <span className="text-subtle">Adresse de retour (OAuth redirect URI)</span>
              <br />
              <code className="break-all">{instagramRedirectUri()}</code>
            </p>
            <p>
              <span className="text-subtle">Adresse du webhook (Callback URL)</span>
              <br />
              <code className="break-all">{instagramRedirectUri().replace("/connexion", "/webhook")}</code>
            </p>
            <p>
              <span className="text-subtle">Jeton de vérification (Verify token)</span>
              <br />
              <code className="break-all">{webhookVerifyToken() || "non défini sur le serveur"}</code>
            </p>
            <p className="text-subtle">
              Champs à cocher : <strong>comments</strong> et <strong>messages</strong>. Les deux adresses doivent être
              recopiées au caractère près — une barre oblique en trop et Meta refuse sans dire pourquoi.
            </p>
          </div>
        </details>
      </Card>

      {/* ---------- Réglages ---------- */}

      <ActionForm action={saveIgSettingsAction} submitLabel="Enregistrer les réglages">
        <Card title="Réglages">
          <Switch
            name="enabled"
            label="Répondre automatiquement"
            hint="L'interrupteur général. Éteint, rien n'est lu ni répondu."
            defaultChecked={view.settings.enabled}
          />
          <Switch
            name="dryRun"
            label="Essai à blanc"
            hint="Tout est décidé et journalisé, rien n'est envoyé. À laisser allumé les premiers jours."
            defaultChecked={view.settings.dryRun}
          />
          <Field
            label="Plafond d'envois par heure"
            hint="Au-delà, on cesse d'envoyer et le journal le dit. Protège d'une règle mal écrite ou d'un post qui s'emballe."
            name="hourlyCap"
          >
            <Input name="hourlyCap" type="number" min={1} max={500} defaultValue={view.settings.hourlyCap} />
          </Field>
        </Card>
      </ActionForm>

      {/* ---------- Les règles ---------- */}

      <ActionForm action={saveIgRulesAction} submitLabel="Enregistrer les règles">
        <Card
          title="Les règles"
          aside={<span className="text-xs text-subtle">la première qui correspond l&apos;emporte</span>}
        >
          <p className="text-xs leading-relaxed text-subtle">
            Elles sont essayées de haut en bas, et la première qui correspond répond. Une règle sans mot-clé prend tout
            ce qui arrive par sa porte : placez-la en dernier.
          </p>

          {[...view.rules, ...Array.from({ length: BLANKS }, () => null)].map((rule, i) => (
            <RuleRow key={rule?.id ?? `nouvelle-${i}`} index={i} rule={rule} />
          ))}

          {warning && <Notice tone="info">{warning}</Notice>}
        </Card>
      </ActionForm>

      {/* ---------- Essayer ---------- */}

      <ActionForm action={testIgRuleAction} submitLabel="Essayer">
        <Card title="Essayer une phrase">
          <p className="text-xs leading-relaxed text-subtle">
            « Si quelqu&apos;un écrivait ceci, que répondrait-on ? » L&apos;essai emprunte exactement le chemin du vrai —
            les mêmes règles, le même choix de formulation — et n&apos;envoie rien. L&apos;interrupteur général et le
            plafond sont ignorés : on essaie les règles, pas l&apos;état du jour.
          </p>
          <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-2.5 max-[749px]:grid-cols-1">
            <Field label="Arrivée par" name="kind">
              <Segmented
                name="kind"
                defaultValue="comment"
                options={[
                  { value: "comment", label: "Commentaire" },
                  { value: "message", label: "Message" },
                ]}
              />
            </Field>
            <Field label="Ce que la personne écrit" name="text">
              <Input name="text" maxLength={500} placeholder="ex. Trop beau 😍 je veux le livre !" />
            </Field>
          </div>
        </Card>
      </ActionForm>

      {/* ---------- Journal ---------- */}

      <Card title="Journal" aside={<span className="text-xs text-subtle">les 40 derniers</span>}>
        <p className="text-xs leading-relaxed text-subtle">
          Ce qui est arrivé, et ce qu&apos;on en a fait — y compris quand on n&apos;a rien fait, avec le motif. C&apos;est
          ici qu&apos;on répond à « pourquoi ce commentaire n&apos;a-t-il rien reçu ? ».
        </p>
        {events.length === 0 ? (
          <p className="rounded-[14px] bg-paper px-4 py-6 text-center text-[0.8125rem] text-subtle">
            Rien encore. Les notifications arriveront dès que le compte sera connecté et abonné.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((e) => {
              const line = eventLine(e);
              return (
                <div key={e.id} className="flex flex-col gap-1 rounded-[14px] bg-paper px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Pill tone={e.kind === "comment" ? "neutral" : "blue"}>{e.kind === "comment" ? "Commentaire" : "Message"}</Pill>
                    <span className="font-bold">{e.fromUsername ? `@${e.fromUsername}` : e.fromId || "—"}</span>
                    <span className="text-subtle">{when(e.at)}</span>
                    {e.ruleName && <span className="text-subtle">· règle « {e.ruleName} »</span>}
                  </div>
                  {e.text && <p className="text-[0.8125rem] italic">« {e.text} »</p>}
                  <p className={`text-xs font-semibold ${line.tone === "green" ? "text-tint-green-ink" : line.tone === "sand" ? "text-danger" : "text-subtle"}`}>
                    {line.what}
                  </p>
                  {e.actions.map((a, k) => (
                    <p key={k} className="text-xs text-subtle">
                      → {a.kind === "publicReply" ? "public" : "privé"} : « {a.text} »
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

/*
 * Une règle. Les mots-clés se saisissent séparés par des virgules, les formulations une
 * par ligne : c'est le formulaire le plus simple qui rende ce service, et il marche sans
 * JavaScript — comme le reste de l'admin.
 */
function RuleRow({ index, rule }: { index: number; rule: IgRule | null }) {
  const base = `rules[${index}]`;
  return (
    <details className="rounded-[14px] bg-paper px-4 py-3" open={!rule}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[0.8125rem] font-bold">
        {rule ? (
          <>
            {!rule.enabled && <Pill tone="neutral">Éteinte</Pill>}
            <span>{rule.name || "Sans nom"}</span>
            <span className="font-medium text-subtle">· {ruleSummary(rule)}</span>
          </>
        ) : (
          <span className="text-subtle">Nouvelle règle</span>
        )}
      </summary>

      <div className="mt-3 flex flex-col gap-2.5">
        <input type="hidden" name={`${base}.id`} value={rule?.id ?? ""} />

        <div className="grid grid-cols-[minmax(0,1fr)_200px_auto] items-end gap-2.5 max-[899px]:grid-cols-1">
          <Field label="Nom" hint="Pour s'y retrouver ici et dans le journal." name={`${base}.name`}>
            <Input name={`${base}.name`} maxLength={80} defaultValue={rule?.name ?? ""} placeholder="ex. Demande du lien" />
          </Field>
          <Field label="Se déclenche sur" name={`${base}.on`}>
            <Segmented
              name={`${base}.on`}
              defaultValue={rule?.on ?? "comment"}
              options={[
                { value: "comment", label: "Commentaire" },
                { value: "message", label: "Message" },
              ]}
            />
          </Field>
          <label className="flex shrink-0 items-center gap-1.5 pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">
            <input type="hidden" name={`${base}.enabled`} value="false" />
            <input type="checkbox" name={`${base}.enabled`} value="true" defaultChecked={rule?.enabled ?? true} className="h-3.5 w-3.5 accent-ink" />
            Active
          </label>
        </div>

        <Field
          label="Mots-clés"
          hint="Séparés par des virgules. Vides = la règle prend tout. Les accents et la casse n'ont pas d'importance, les emoji fonctionnent."
          name={`${base}.keywords`}
        >
          <Input name={`${base}.keywords`} maxLength={600} defaultValue={rule?.keywords.join(", ") ?? ""} placeholder="un mot, un autre" />
        </Field>

        <Field
          label="Publications visées"
          hint="Identifiants Meta séparés par des virgules. Vide = toutes, y compris celles à venir — c'est le cas ordinaire."
          name={`${base}.mediaIds`}
        >
          <Input name={`${base}.mediaIds`} maxLength={2000} defaultValue={rule?.mediaIds.join(", ") ?? ""} placeholder="toutes les publications" />
        </Field>

        <Field
          label="Réponses publiques"
          hint="Une par ligne : elles sont tirées à tour de rôle. Dix fois la même phrase sous dix commentaires, ça se voit. Vide = pas de réponse publique."
          name={`${base}.publicReplies`}
        >
          <Textarea name={`${base}.publicReplies`} rows={3} maxLength={3000} defaultValue={rule?.publicReplies.join("\n") ?? ""} placeholder="Une formulation par ligne." />
        </Field>

        <Field
          label="Message privé"
          hint="Part en direct. Sur un commentaire : une seule fois, dans les 7 jours. Vide = pas de message privé."
          name={`${base}.privateReply`}
        >
          <Textarea name={`${base}.privateReply`} rows={3} maxLength={900} defaultValue={rule?.privateReply ?? ""} placeholder="Le message qui part en privé." />
        </Field>

        {rule && (
          <p className="text-xs text-subtle">
            Pour supprimer cette règle : videz son nom et ses deux réponses, puis enregistrez.
          </p>
        )}
      </div>
    </details>
  );
}
