"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteContract, getContract, listContracts, upsertContract } from "@/lib/db/contracts";
import { newId } from "@/lib/db/helpers";
import { CollaborationType, ContractPublication } from "@/lib/domain/types";

/*
 * Contrats de collaboration. Un contrat déjà signé ne se réécrit pas : la signature en
 * garde une copie figée, et la version (« UGC-2026-09-v1 ») dit laquelle a été acceptée.
 * Modifier le texte d'un contrat vaut donc pour les signatures À VENIR seulement — d'où
 * l'insistance de l'écran sur le numéro de version.
 */

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
  active: z.boolean().default(true),
});

/*
 * Les parutions exigées, telles que l'éditeur les a sérialisées.
 *
 * L'identifiant est posé ICI, et conservé d'un enregistrement à l'autre : c'est lui qui
 * rattache un lien déjà saisi à sa ligne. Renommer « Vidéo TikTok » en « Réel TikTok »
 * ne doit pas perdre l'adresse qu'on y avait collée — d'où un identifiant, et non la
 * position ni le libellé. Une ligne sans nom est écartée en silence : l'éditeur en
 * ajoute une vide au clic, et une ligne qu'on n'a pas remplie n'exige rien.
 */
const PublicationLine = z.object({
  id: z.string().trim().max(40).default(""),
  label: z.string().trim().max(80).default(""),
  qty: z.coerce.number().int().min(1).max(20).catch(1),
});

function publicationsFrom(raw: string, previous: ContractPublication[]): ContractPublication[] {
  if (!raw.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    /* Illisible : on ne jette pas ce qui était là. */
    return previous;
  }
  const parsed = z.array(PublicationLine).max(40).safeParse(data);
  if (!parsed.success) return previous;

  const known = new Set(previous.map((p) => p.id));
  const used = new Set<string>();
  const lines: ContractPublication[] = [];
  for (const line of parsed.data) {
    if (!line.label) continue;
    /* Un identifiant n'est repris que s'il vient bien de ce contrat et n'a pas déjà
       servi : le reste est posé à neuf, pour que rien du client ne décide d'un
       rattachement. */
    const id = line.id && known.has(line.id) && !used.has(line.id) ? line.id : newId("pub");
    used.add(id);
    lines.push({ id, label: line.label, qty: line.qty });
  }
  return lines;
}

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

  const contract = await upsertContract({
    id: d.id || undefined,
    name: d.name,
    type: d.type,
    version: d.version,
    summary: d.summary,
    body: d.body,
    expected: { photos: d.expectedPhotos, videos: d.expectedVideos },
    publications: publicationsFrom(d.publications, all.find((c) => c.id === d.id)?.publications ?? []),
    ...variablesFrom(formData),
    active: d.active,
  });
  await audit(user.email, d.id ? "contract.update" : "contract.create", `contracts/${contract.id}`, `${contract.name} · ${contract.version}`);
  revalidatePath("/admin/contrats");
  return { ok: true, message: `Contrat « ${contract.name} » enregistré.`, redirectTo: `/admin/contrats?id=${contract.id}` };
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
