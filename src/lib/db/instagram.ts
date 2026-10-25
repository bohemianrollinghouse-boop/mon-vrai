import "server-only";
import { EMPTY_IG_INTEGRATION, IgEvent, IgIntegration, tokenDead, tokenStale, type IgConnection, type IgRule, type IgSettings } from "@/lib/domain/instagram";
import { refreshLongLived } from "@/lib/instagram/client";
import { col, now, parseDoc } from "./helpers";

/*
 * Le dispositif Instagram en base : un document pour la connexion, les réglages et les
 * règles ; une collection pour le journal.
 *
 * Le jeton d'accès vit ici et nulle part ailleurs. Il ne doit jamais remonter jusqu'à
 * un composant : `publicView()` plus bas est la seule forme qui ait le droit d'aller à
 * l'écran, et c'est elle qu'on appelle depuis les pages.
 */

const ref = () => col("integrations").doc("instagram");

export async function getIntegration(): Promise<IgIntegration> {
  return (await parseDoc(IgIntegration, await ref().get())) ?? EMPTY_IG_INTEGRATION;
}

/* ---------- Écrire, champ par champ ---------- */

/*
 * Trois écritures distinctes plutôt qu'un `save` général, pour la raison qui vaut déjà
 * pour /admin/reglages et /admin/livraison : chaque formulaire ne réécrit que ce qu'il
 * porte. Enregistrer les règles ne doit pas pouvoir éteindre l'interrupteur général, ni
 * déconnecter le compte.
 */
export async function setConnection(connection: IgConnection | null): Promise<void> {
  const current = await getIntegration();
  await ref().set(IgIntegration.parse({ ...current, connection, updatedAt: now() }));
}

export async function setSettings(settings: IgSettings): Promise<void> {
  const current = await getIntegration();
  await ref().set(IgIntegration.parse({ ...current, settings, updatedAt: now() }));
}

export async function setRules(rules: IgRule[]): Promise<void> {
  const current = await getIntegration();
  await ref().set(IgIntegration.parse({ ...current, rules, updatedAt: now() }));
}

/* ---------- Le jeton, tenu en vie ---------- */

/*
 * Le jeton valable, renouvelé au passage s'il approche de sa fin.
 *
 * Le renouvellement est PARESSEUX, et non programmé : le webhook passe ici à chaque
 * commentaire, donc le jeton se prolonge de lui-même tant que le compte vit. Une tâche
 * planifiée aurait demandé une infrastructure de plus (Cloud Scheduler, une route à
 * protéger) pour le seul cas d'un compte qui ne reçoit rien pendant cinquante jours —
 * cas où l'écran, lui, affiche le compte à rebours et où un simple passage dans
 * l'admin suffit à relancer la machine.
 *
 * Un échec de renouvellement ne jette pas le jeton courant : il est peut-être encore
 * bon pour cinquante jours, et une panne passagère chez Meta ne doit pas couper les
 * réponses du jour.
 */
export async function validToken(): Promise<{ token: string; connection: IgConnection } | null> {
  const { connection } = await getIntegration();
  if (!connection) return null;
  const at = now();
  if (tokenDead(connection.expiresAt, at)) return null;
  if (!tokenStale(connection.expiresAt, at)) return { token: connection.accessToken, connection };

  try {
    const fresh = await refreshLongLived(connection.accessToken);
    const next: IgConnection = {
      ...connection,
      accessToken: fresh.accessToken,
      expiresAt: at + fresh.expiresIn * 1000,
      refreshedAt: at,
    };
    await setConnection(next);
    return { token: next.accessToken, connection: next };
  } catch (err) {
    console.warn("[instagram] renouvellement du jeton impossible :", err);
    return { token: connection.accessToken, connection };
  }
}

/* ---------- Le journal ---------- */

/*
 * Un identifiant Meta peut porter des caractères qu'un chemin Firestore refuse (« / »
 * notamment, dans les identifiants de message). On le transpose, comme `db/pages.docId`
 * le fait pour les adresses de pages.
 */
const eventDocId = (sourceId: string) => sourceId.replace(/[/]/g, "_").slice(0, 400) || `ev_${now()}`;

/*
 * Inscrit l'événement, et dit s'il était nouveau.
 *
 * `create()` et non `set()` : c'est LUI le garde-fou contre le doublon. Meta rejoue ses
 * webhooks dès qu'une réponse tarde, et deux instances peuvent traiter le même
 * commentaire en même temps — seule une écriture qui échoue quand le document existe
 * déjà peut les départager. Un `exists ?` lu avant d'écrire laisserait les deux passer.
 */
export async function claimEvent(sourceId: string): Promise<boolean> {
  try {
    await col("ig_events").doc(eventDocId(sourceId)).create({ at: now(), sourceId, pending: true });
    return true;
  } catch {
    return false;
  }
}

/** Complète la ligne réservée par `claimEvent` une fois qu'on sait ce qu'on a fait. */
export async function recordEvent(event: IgEvent): Promise<void> {
  await col("ig_events").doc(eventDocId(event.sourceId || event.id)).set(IgEvent.parse(event));
}

/*
 * Ce qui a été ENVOYÉ depuis une heure — les essais à blanc et les refus ne comptent
 * pas : le plafond protège les gens d'un afflux de messages, pas la base d'un afflux
 * de lignes.
 */
export async function sentSince(from: number): Promise<number> {
  const snap = await col("ig_events").where("at", ">=", from).get();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { dryRun?: boolean; actions?: { ok?: boolean }[] };
    if (data.dryRun) continue;
    count += (data.actions ?? []).filter((a) => a.ok).length;
  }
  return count;
}

export async function listEvents(limit = 60): Promise<IgEvent[]> {
  const snap = await col("ig_events").orderBy("at", "desc").limit(limit).get();
  /*
   * Les lignes seulement réservées (webhook reçu, traitement pas encore écrit) n'ont
   * pas la forme d'un événement : on les écarte plutôt que de faire lever `parseDoc`
   * et d'emporter l'écran avec elles.
   */
  return snap.docs
    .map((d) => IgEvent.safeParse(d.data()))
    .filter((r) => r.success)
    .map((r) => r.data);
}

/* ---------- Ce qui a le droit d'aller à l'écran ---------- */

export type IgPublicView = {
  /*
   * L'heure de la lecture. Elle vient d'ici et non du rendu : un composant serveur
   * doit rester pur (`react-hooks/purity`), et la page a besoin du moment présent pour
   * dire combien de jours il reste au jeton.
   */
  at: number;
  connected: boolean;
  username: string;
  igUserId: string;
  expiresAt: number;
  scopes: string[];
  connectedAt: number;
  settings: IgSettings;
  rules: IgRule[];
};

/*
 * La même chose, sans le jeton. Une page serveur sérialise ce qu'elle passe à ses
 * composants : tout champ laissé dans l'objet finit dans le HTML envoyé au navigateur.
 * D'où cette porte unique, et le fait que les pages n'appellent jamais
 * `getIntegration()` directement.
 */
export async function publicView(): Promise<IgPublicView> {
  const { connection, settings, rules } = await getIntegration();
  return {
    at: now(),
    connected: Boolean(connection),
    username: connection?.username ?? "",
    igUserId: connection?.igUserId ?? "",
    expiresAt: connection?.expiresAt ?? 0,
    scopes: connection?.scopes ?? [],
    connectedAt: connection?.connectedAt ?? 0,
    settings,
    rules,
  };
}
