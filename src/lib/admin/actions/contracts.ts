"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteContract, getContract, listContracts, upsertContract } from "@/lib/db/contracts";
import { publicationLines } from "@/lib/admin/publications";
import { getDocument } from "@/lib/db/documents";
import { cleanUrl } from "@/lib/admin/publications";
import { CONTRACT_DRAFTS, draftToContract } from "@/lib/contracts/drafts";
import { EMPTY_GUIDE, type BusinessDoc, type ContractGuide } from "@/lib/domain/types";

/*
 * L'annexe telle qu'elle sera écrite : le document est relu en base — un identifiant
 * posté qui ne désigne rien ne doit pas être écrit, sans quoi le contrat annoncerait une
 * annexe introuvable — et le lien n'est retenu que s'il s'ouvre vraiment (http ou
 * https). Sans PDF ni lien, le libellé seul ne vaut rien : l'annexe est alors vide.
 *
 * Un identifiant qui ne se relit pas fait désormais ÉCHOUER l'enregistrement, au lieu
 * d'être remplacé par du vide. L'ancienne version avalait le cas : on choisissait son
 * annexe, on enregistrait, et le menu réaffichait « Aucun document » sans un mot — le
 * contraire d'un refus, puisque rien ne disait qu'il y avait eu refus. Choisir quelque
 * chose et retrouver le vide est la pire des réponses : on recommence, et on recommence.
 */
type GuideResult = { ok: true; guide: ContractGuide } | { ok: false; error: string };

async function guideFrom(d: { guideDocumentId: string; guideUrl: string; guideLabel: string }): Promise<GuideResult> {
  const url = cleanUrl(d.guideUrl) ?? "";
  if (!d.guideDocumentId) return { ok: true, guide: url ? { label: d.guideLabel, documentId: "", url } : EMPTY_GUIDE };

  let doc: BusinessDoc | null;
  try {
    doc = await getDocument(d.guideDocumentId);
  } catch (e) {
    return { ok: false, error: `L'annexe choisie n'a pas pu être relue : ${(e as Error).message}` };
  }
  if (!doc) {
    return { ok: false, error: "L'annexe choisie n'est plus dans la bibliothèque. Redéposez-la, ou choisissez-en une autre." };
  }
  /* L'identifiant vient du document relu, et non du formulaire : ce qu'on écrit est ce
     qu'on a vérifié. */
  return { ok: true, guide: { label: d.guideLabel, documentId: doc.id, url } };
}
import { newId } from "@/lib/db/helpers";
import { CollaborationType } from "@/lib/domain/types";

/*
 * Contrats de collaboration. Un contrat déjà signé ne se réécrit pas : la signature en
 * garde une copie figée, et la version (« UGC-2026-09-v1 ») dit laquelle a été acceptée.
 * Modifier le texte d'un contrat vaut donc pour les signatures À VENIR seulement — d'où
 * l'insistance de l'écran sur le numéro de version.
 */

/*
 * Installe les contrats rédigés (voir lib/contracts/drafts.ts).
 *
 * C'est le seul moyen de poser un contrat écrit à la main en production, sans ligne de
 * commande ni clé de compte de service — le même besoin que le bouton « Reprendre le
 * contenu rédigé » des pages éditoriales.
 *
 * Idempotent par la VERSION : un contrat déjà présent sous la même version n'est PAS
 * réécrit, et c'est la règle qui compte ici — une version identifie ce qui a été signé,
 * et le texte accepté ne se corrige jamais derrière son signataire. Pour changer un
 * contrat installé, on en publie une version suivante.
 */
export async function installContractDraftsAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  const existing = await listContracts();
  const versions = new Set(existing.map((c) => c.version.trim().toLowerCase()));

  const added: string[] = [];
  for (const draft of CONTRACT_DRAFTS) {
    if (versions.has(draft.version.trim().toLowerCase())) continue;
    await upsertContract(draftToContract(draft));
    added.push(`${draft.name} (${draft.version})`);
  }

  if (added.length === 0) return saved("Les contrats rédigés sont déjà installés : rien n'a été réécrit.");
  await audit(user.email, "contract.install", "contracts", added.join(" · "));
  revalidatePath("/admin/contrats");
  return saved(`${added.length === 1 ? "Contrat installé" : `${added.length} contrats installés`} : ${added.join(", ")}.`);
}

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1, "Donnez un nom au contrat").max(120),
  type: CollaborationType,
  version: z.string().trim().min(1, "Indiquez une version").max(40),
  summary: z.string().max(8000).default(""),
  body: z.string().max(200000).default(""),
  /* Ce que le contrat réclame en retour. En chiffres : c'est de là que « il manque
     6 photos sur 40 » se déduit, campagne par campagne. */
  expectedPhotos: z.number().int().min(0).max(999).default(0),
  expectedVideos: z.number().int().min(0).max(999).default(0),
  /** Parutions exigées, sérialisées en JSON par l'éditeur. */
  publications: z.string().default(""),
  guideDocumentId: z.string().trim().max(60).default(""),
  guideUrl: z.string().trim().max(500).default(""),
  guideLabel: z.string().trim().max(120).default(""),
  active: z.boolean().default(true),
});

/* Les variables de campagne arrivent en champs `var:CLÉ` : l'éditeur les détecte dans
   le texte, il n'y a donc pas de liste fixe à tenir ici. */
function variablesFrom(formData: FormData): { variables: Record<string, string>; requiredVariables: string[] } {
  const variables: Record<string, string> = {};
  const requiredVariables: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("var:")) {
      const name = key.slice(4);
      if (/^[A-Z0-9_]{1,60}$/.test(name)) variables[name] = value.slice(0, 2000);
    } else if (key.startsWith("req:") && (value === "on" || value === "true")) {
      const name = key.slice(4);
      if (/^[A-Z0-9_]{1,60}$/.test(name)) requiredVariables.push(name);
    }
  }
  return { variables, requiredVariables };
}

export async function saveContractAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["expectedPhotos", "expectedVideos"], booleans: ["active"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  if (!d.body.trim()) return failed("Le contrat est vide.", { body: "Requis" });

  const all = await listContracts();
  const others = all.filter((c) => c.id !== d.id);
  if (others.some((c) => c.version.toLowerCase() === d.version.toLowerCase())) {
    return failed(`La version « ${d.version} » existe déjà. Une version ne se réutilise jamais : elle identifie ce qui a été signé.`, { version: "Déjà utilisée" });
  }

  const guide = await guideFrom(d);
  if (!guide.ok) return failed(guide.error, { guideDocumentId: "Annexe introuvable" });

  const contract = await upsertContract({
    id: d.id || undefined,
    name: d.name,
    type: d.type,
    version: d.version,
    summary: d.summary,
    body: d.body,
    expected: { photos: d.expectedPhotos, videos: d.expectedVideos },
    publications: publicationLines(d.publications, all.find((c) => c.id === d.id)?.publications ?? [], () => newId("pub")),
    guide: guide.guide,
    ...variablesFrom(formData),
    active: d.active,
  });
  await audit(user.email, d.id ? "contract.update" : "contract.create", `contracts/${contract.id}`, `${contract.name} · ${contract.version}`);
  revalidatePath("/admin/contrats");
  return { ok: true, message: `Contrat « ${contract.name} » enregistré.`, redirectTo: `/admin/contrats?id=${contract.id}` };
}

/*
 * Attache une pièce de la bibliothèque comme annexe d'un contrat, et rien d'autre.
 *
 * Elle existe parce que le chemin d'avant demandait trois gestes pour un seul besoin :
 * déposer le fichier, remonter le choisir dans un menu, puis enregistrer tout le
 * contrat. Or on ne dépose une annexe DEPUIS la fiche d'un contrat que pour une raison :
 * en faire l'annexe de ce contrat-là. Le dépôt le fait donc lui-même.
 *
 * Elle ne réécrit que `guide`, et garde le libellé et le lien déjà posés : attacher un
 * PDF n'est pas renégocier l'annexe. Même principe que `savePublicationsAction`, qui
 * constate une parution sans toucher au reste de la campagne.
 */
export async function attachContractGuideAction(contractId: string, documentId: string): Promise<AdminResult> {
  try {
    const user = await assertAdmin();
    const contract = await getContract(contractId);
    if (!contract) return failed("Ce contrat n'existe plus.");

    const doc = await getDocument(documentId);
    if (!doc) return failed("La pièce déposée est introuvable.");

    await upsertContract({
      ...contract,
      /* Le libellé vide prend le titre de la pièce : une annexe sans nom afficherait un
         bouton muet, et c'est le seul moment où l'on connaît un nom à proposer. */
      guide: { label: contract.guide.label || doc.title, documentId: doc.id, url: contract.guide.url },
    });
    await audit(user.email, "contract.guide", `contracts/${contract.id}`, `annexe → documents/${doc.id}`);
    revalidatePath("/admin/contrats");
    return saved(`« ${doc.title} » est l'annexe de ce contrat.`);
  } catch (e) {
    return failed(`L'annexe n'a pas pu être attachée : ${(e as Error).message}`);
  }
}

export async function deleteContractAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return failed("Contrat inconnu");
  const contract = await getContract(id);
  if (!contract) return failed("Contrat introuvable");

  await deleteContract(id);
  await audit(user.email, "contract.delete", `contracts/${id}`, `${contract.name} · ${contract.version}`);
  revalidatePath("/admin/contrats");
  // Redirection côté serveur : la fiche que l'on vient d'effacer se rendrait en 404.
  redirect("/admin/contrats");
}
