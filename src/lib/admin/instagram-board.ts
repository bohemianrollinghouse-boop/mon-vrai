import { shadowedRules, type IgEvent, type IgRule, type IgSettings } from "@/lib/domain/instagram";

/*
 * Ce que /admin/instagram affiche, mis en mots. Pur et testé : les phrases d'un écran
 * qui pilote des envois automatiques doivent pouvoir se vérifier sans base ni réseau —
 * dire « actif » quand rien ne part serait pire que de ne rien dire.
 */

export type BoardState = { label: string; tone: "green" | "sand" | "blue" | "white"; note: string };

/*
 * L'état du dispositif en trois mots. Trois situations, et l'essai à blanc n'est pas
 * un détail d'affichage : c'est le cas où tout semble marcher et où personne ne reçoit
 * rien. Il se dit donc aussi franchement que l'extinction.
 */
export function boardState(settings: IgSettings, connected: boolean): BoardState {
  if (!connected) return { label: "Aucun compte", tone: "white", note: "connectez un compte Instagram pour commencer" };
  if (!settings.enabled) return { label: "Éteint", tone: "white", note: "rien n'est lu, rien n'est répondu" };
  if (settings.dryRun) return { label: "Essai à blanc", tone: "blue", note: "tout est journalisé, rien n'est envoyé" };
  return { label: "Actif", tone: "green", note: `jusqu'à ${settings.hourlyCap} envois par heure` };
}

/* ---------- Une règle, résumée ---------- */

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/*
 * « Commentaire · 3 mots-clés · réponse publique et privée ». La ligne qu'on lit dans
 * la liste avant d'ouvrir la règle, et qui doit suffire à savoir si c'est celle qu'on
 * cherche.
 */
export function ruleSummary(rule: IgRule): string {
  const parts = [rule.on === "comment" ? "Commentaire" : "Message reçu"];
  parts.push(rule.keywords.length === 0 ? "tous" : count(rule.keywords.length, "mot-clé", "mots-clés"));
  if (rule.mediaIds.length > 0) parts.push(count(rule.mediaIds.length, "publication"));
  const answers = [rule.publicReplies.length > 0 ? "public" : "", rule.privateReply ? "privé" : ""].filter(Boolean);
  parts.push(answers.length === 2 ? "public et privé" : answers[0] || "rien à répondre");
  return parts.join(" · ");
}

/*
 * L'avertissement que l'écran porte sous la liste, ou rien. Même raison qu'à
 * l'enregistrement : une règle qui ne se déclenchera jamais doit se savoir en la
 * regardant, et non en constatant au bout d'une semaine qu'elle n'a rien fait.
 */
export function shadowWarning(rules: IgRule[]): string {
  const dead = shadowedRules(rules);
  if (dead.length === 0) return "";
  const names = rules.filter((r) => dead.includes(r.id)).map((r) => `« ${r.name || r.id} »`).join(", ");
  return `${names} ne se déclenchera${dead.length > 1 ? "ont" : ""} jamais : une règle sans mot-clé placée plus haut prend déjà tout ce qui arrive par cette porte.`;
}

/* ---------- Un événement, résumé ---------- */

export type EventLine = { what: string; tone: "green" | "blue" | "sand" | "white" };

/*
 * Ce qu'on lit dans le journal, par ligne. L'ordre des cas est celui dans lequel on se
 * pose les questions : est-ce parti ? sinon, qu'est-ce qui aurait dû partir ? sinon,
 * pourquoi rien ?
 */
export function eventLine(event: IgEvent): EventLine {
  const failed = event.actions.filter((a) => !a.ok && a.error);
  const sent = event.actions.filter((a) => a.ok);

  if (event.dryRun) {
    const would = event.actions.map((a) => (a.kind === "publicReply" ? "public" : "privé")).join(" et ");
    return { what: would ? `Aurait répondu en ${would}` : "Essai à blanc", tone: "blue" };
  }
  if (failed.length > 0 && sent.length === 0) return { what: `Échec : ${failed[0].error}`, tone: "sand" };
  if (sent.length > 0) {
    const how = sent.map((a) => (a.kind === "publicReply" ? "public" : "privé")).join(" et ");
    return { what: `Répondu en ${how}${failed.length > 0 ? ` (l'autre a échoué : ${failed[0].error})` : ""}`, tone: "green" };
  }
  return { what: event.skipped || "Rien à faire", tone: "white" };
}

/*
 * Combien de personnes ont VRAIMENT reçu quelque chose, sur les événements qu'on a
 * sous la main. Les essais à blanc n'en sont pas : c'est tout l'intérêt de les
 * distinguer.
 */
export const reallySent = (events: IgEvent[]): number => events.filter((e) => !e.dryRun && e.actions.some((a) => a.ok)).length;
