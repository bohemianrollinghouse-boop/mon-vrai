import "server-only";
import { decide, type IgAction, type IgEvent, type IgTrigger } from "@/lib/domain/instagram";
import { claimEvent, getIntegration, recordEvent, sentSince, validToken } from "@/lib/db/instagram";
import { newId, now } from "@/lib/db/helpers";
import { privateReply, replyToComment, sendMessage } from "./client";

/*
 * Le moteur : ce qui se passe entre « Meta nous signale quelque chose » et « quelqu'un
 * reçoit une réponse ».
 *
 * Il ne décide rien lui-même. `domain/instagram.decide()` tranche, ce fichier exécute
 * et consigne. La séparation n'est pas décorative : elle permet de vérifier la totalité
 * des choix — quelle règle, quel texte, pourquoi rien — sans réseau, et elle fait que
 * le journal dit toujours la même chose que ce qui a été fait.
 */

export type Incoming = {
  kind: IgTrigger;
  /** L'identifiant Meta du commentaire ou du message : clé du journal et de l'unicité. */
  sourceId: string;
  text: string;
  fromId: string;
  fromUsername: string;
  /** Vide pour un message privé. */
  mediaId: string;
};

const HOUR = 60 * 60 * 1000;

/*
 * Traite une notification, une fois. Ne lève jamais : un webhook qui lève est un
 * webhook que Meta rejoue, et rejouer ne réparera rien ici. Tout ce qui tourne mal
 * s'écrit au journal, qui est l'endroit où on le cherchera.
 */
export async function handleIncoming(incoming: Incoming): Promise<void> {
  /*
   * La réservation d'abord, avant toute lecture : c'est elle qui départage deux
   * instances traitant le même commentaire, et elle ne vaut que si rien ne passe
   * devant. Déjà réservé = déjà traité (ou en train de l'être), on s'arrête.
   */
  if (!(await claimEvent(incoming.sourceId))) return;

  const at = now();
  const base: IgEvent = {
    id: newId("ige"),
    at,
    kind: incoming.kind,
    sourceId: incoming.sourceId,
    fromId: incoming.fromId,
    fromUsername: incoming.fromUsername,
    text: incoming.text.slice(0, 2000),
    mediaId: incoming.mediaId,
    ruleId: "",
    ruleName: "",
    actions: [],
    skipped: "",
    dryRun: false,
  };

  try {
    const { connection, settings, rules } = await getIntegration();
    if (!connection) {
      await recordEvent({ ...base, skipped: "Aucun compte connecté" });
      return;
    }

    const decision = decide({
      incoming: { kind: incoming.kind, text: incoming.text, mediaId: incoming.mediaId },
      fromId: incoming.fromId,
      igUserId: connection.igUserId,
      sourceId: incoming.sourceId,
      rules,
      settings,
      sentThisHour: await sentSince(at - HOUR),
    });

    if (!decision.act) {
      await recordEvent({ ...base, skipped: decision.reason });
      return;
    }

    const { rule, publicReply, privateReply: dm } = decision;
    const tagged = { ...base, ruleId: rule.id, ruleName: rule.name || rule.id };

    /*
     * Essai à blanc : on inscrit ce qui SERAIT parti, texte compris, et rien ne part.
     * C'est le mode des premiers jours — un jeu d'essai ne montre pas ce que de vraies
     * gens écrivent sous un vrai post.
     */
    if (settings.dryRun) {
      const would: IgAction[] = [];
      if (publicReply) would.push({ kind: "publicReply", text: publicReply, ok: false, error: "" });
      if (dm) would.push({ kind: "privateReply", text: dm, ok: false, error: "" });
      await recordEvent({ ...tagged, actions: would, dryRun: true });
      return;
    }

    const auth = await validToken();
    if (!auth) {
      await recordEvent({ ...tagged, skipped: "Jeton expiré — reconnecter le compte" });
      return;
    }

    const actions: IgAction[] = [];

    /*
     * Le message privé d'abord. Les deux sont indépendants, mais celui-ci est le seul
     * qui puisse se périmer (7 jours, et une seule fois pour ce commentaire) : s'il ne
     * doit en passer qu'un, que ce soit lui.
     */
    if (dm) {
      try {
        if (incoming.kind === "comment") await privateReply(auth.token, incoming.sourceId, dm);
        /* Un DM reçu ouvre 24 h : on répond à la personne, pas à un commentaire. */
        else await sendMessage(auth.token, { id: incoming.fromId }, dm);
        actions.push({ kind: "privateReply", text: dm, ok: true, error: "" });
      } catch (err) {
        actions.push({ kind: "privateReply", text: dm, ok: false, error: message(err) });
      }
    }

    if (publicReply && incoming.kind === "comment") {
      try {
        await replyToComment(auth.token, incoming.sourceId, publicReply);
        actions.push({ kind: "publicReply", text: publicReply, ok: true, error: "" });
      } catch (err) {
        actions.push({ kind: "publicReply", text: publicReply, ok: false, error: message(err) });
      }
    }

    await recordEvent({ ...tagged, actions });
  } catch (err) {
    /* Même une panne doit laisser une ligne : un journal muet ne s'explique pas. */
    await recordEvent({ ...base, skipped: `Erreur : ${message(err)}` }).catch(() => {});
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);
