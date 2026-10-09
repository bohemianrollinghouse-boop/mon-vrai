import "server-only";
import { storage } from "@/lib/firebase/admin";
import { contentKind, contentPath, MAX_CONTENT_BYTES, safeFileName } from "@/lib/domain/deliverables";
import { Deliverable } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Les contenus rendus par les partenaires : les fichiers sous `ugc/`, leurs fiches dans
 * `deliverables`.
 *
 * L'envoi ne passe PAS par le serveur, et c'est la seule exception du projet à cette
 * règle. Une action serveur plafonne à 45 Mo et doit tenir le fichier entier en mémoire
 * d'une instance qui n'a qu'un gigaoctet : une vidéo de partenaire, qui pèse couramment
 * dix fois plus, ne passerait jamais. Le navigateur dépose donc directement dans le
 * coffre, où storage.rules n'ouvre `ugc/` qu'à un administrateur connecté.
 *
 * Ce que le client annonce n'est pour autant cru sur rien. Le chemin est RECALCULÉ par
 * `contentPath`, le type et la taille sont relus sur l'objet déposé, et c'est seulement
 * ensuite qu'une fiche est écrite. Un fichier qui n'est ni une photo ni une vidéo est
 * effacé du coffre séance tenante : sans fiche, rien ne saurait plus le retrouver.
 */

const deliverables = () => col("deliverables");

/** Le coffre, par son nom : le navigateur en a besoin pour viser le bon. */
export const bucketName = (): string => storage().bucket().name;

/*
 * L'identifiant est posé AVANT l'envoi — il nomme le dossier où le fichier atterrit.
 * Son préfixe est vérifié au retour : ce qui revient du navigateur doit avoir la forme
 * de ce qu'on lui a donné.
 */
export const newDeliverableId = (): string => newId("ugc");
export const looksLikeDeliverableId = (id: string): boolean => /^ugc_[a-z0-9]{20}$/.test(id);

export async function getDeliverable(id: string): Promise<Deliverable | null> {
  if (!id) return null;
  return parseDoc(Deliverable, await deliverables().doc(id).get());
}

/** Les contenus d'une campagne, le dernier arrivé d'abord. */
export async function listDeliverables(campaignId: string): Promise<Deliverable[]> {
  if (!campaignId) return [];
  const list = await parseQuery(Deliverable, deliverables().where("campaignId", "==", campaignId).limit(500));
  return list.sort((a, b) => b.receivedAt - a.receivedAt);
}

/*
 * Tout ce qu'une personne a rendu, campagnes confondues : la fiche du partenaire affiche
 * le décompte de chaque vignette, et une lecture vaut mieux qu'une par campagne.
 */
export async function listDeliverablesForInfluencer(influencerId: string): Promise<Deliverable[]> {
  if (!influencerId) return [];
  return parseQuery(Deliverable, deliverables().where("influencerId", "==", influencerId).limit(1000));
}

/** Y a-t-il quelque chose au dossier ? Sert à refuser la suppression d'une campagne. */
export async function hasDeliverables(campaignId: string): Promise<boolean> {
  if (!campaignId) return false;
  const snap = await deliverables().where("campaignId", "==", campaignId).limit(1).get();
  return !snap.empty;
}

export type RecordInput = { id: string; campaignId: string; influencerId: string; filename: string; note?: string };

/**
 * Inscrit un fichier déjà déposé dans le coffre. Tout ce qui décrit le fichier est relu
 * sur l'objet lui-même ; l'appelant ne fournit que de quoi le retrouver.
 */
export async function recordDeliverable(input: RecordInput): Promise<Deliverable> {
  if (!looksLikeDeliverableId(input.id)) throw new Error("Référence de contenu invalide");
  if (await getDeliverable(input.id)) throw new Error("Ce contenu est déjà au dossier");

  const path = contentPath(input.campaignId, input.id, input.filename);
  const file = storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Le fichier n'est pas arrivé dans le coffre : réessayez.");

  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  const mime = String(meta.contentType ?? "");
  const kind = contentKind(input.filename, mime);

  const refusal =
    !kind ? `Ni photo ni vidéo (${mime || "type inconnu"})`
    : size === 0 ? "Fichier vide"
    : size > MAX_CONTENT_BYTES ? `Fichier trop volumineux (${Math.round(MAX_CONTENT_BYTES / 1024 / 1024)} Mo maximum)`
    : "";
  if (refusal || !kind) {
    /* Refusé : l'objet ne reste pas dans le coffre. Sans fiche, rien ne le retrouverait
       plus, et il se paierait indéfiniment. */
    await file.delete({ ignoreNotFound: true });
    throw new Error(refusal || "Fichier refusé");
  }

  const doc = Deliverable.parse({
    id: input.id,
    campaignId: input.campaignId,
    influencerId: input.influencerId,
    kind,
    path,
    filename: safeFileName(input.filename),
    mime,
    size,
    note: input.note ?? "",
    receivedAt: now(),
  });
  await deliverables().doc(input.id).set(doc);
  return doc;
}

export async function deleteDeliverable(id: string): Promise<Deliverable | null> {
  const doc = await getDeliverable(id);
  if (!doc) return null;
  await storage().bucket().file(doc.path).delete({ ignoreNotFound: true });
  await deliverables().doc(id).delete();
  return doc;
}

/*
 * Le fichier, en flux et par tranches. Une vidéo ne se lit pas d'un bloc : la charger
 * entière en mémoire pour la rendre épuiserait l'instance, et un navigateur ne la
 * demande de toute façon jamais ainsi — il réclame l'intervalle dont il a besoin pour
 * commencer, puis les suivants. D'où un flux, et non un Buffer comme pour les factures.
 */
export async function openDeliverable(id: string, range?: { start: number; end: number }): Promise<{ doc: Deliverable; stream: NodeJS.ReadableStream } | null> {
  const doc = await getDeliverable(id);
  if (!doc) return null;
  const file = storage().bucket().file(doc.path);
  return { doc, stream: range ? file.createReadStream({ start: range.start, end: range.end }) : file.createReadStream() };
}
