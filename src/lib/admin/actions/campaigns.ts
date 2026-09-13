"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteCampaign, getCampaign, listCampaigns, upsertCampaign } from "@/lib/db/campaigns";
import { getSignature, setSignatureState } from "@/lib/db/contracts";
import { getInfluencer } from "@/lib/db/promos";
import { CollaborationType } from "@/lib/domain/types";

/*
 * Les campagnes d'un partenaire.
 *
 * La fiche du partenaire décrit la personne ; une campagne décrit ce qu'on négocie avec
 * elle une fois : le kit offert, le contrat à signer, ses réglages. Il y en a autant
 * qu'on veut dans le temps, et une campagne passée n'est jamais réécrite — c'est ce qui
 * permet de retrouver, des deux côtés, ce qui avait été convenu l'an dernier.
 */

const Input = z.object({
  id: z.string().default(""),
  influencerId: z.string().min(1),
  name: z.string().trim().max(80).default(""),
  collaborationType: CollaborationType.default("UGC"),
  contractId: z.string().trim().default(""),
  /* Le kit, dans le même formulaire : il fait partie de ce qui se négocie. */
  enabled: z.boolean().default(false),
  deductStock: z.boolean().default(false),
  prototype: z.boolean().default(false),
  title: z.string().trim().max(80).default("Votre kit de bienvenue"),
  text: z.string().trim().max(400).default(""),
  /** Sélection sérialisée par l'éditeur : `slug:quantité`, séparés par des virgules. */
  lines: z.string().default(""),
});

/*
 * Variables du contrat ajustées pour CETTE campagne, postées en `cvar:CLÉ`. On ne garde
 * que ce qui diffère de la valeur du contrat : une valeur identique n'a pas à être
 * recopiée, sans quoi corriger un délai dans le contrat ne se répercuterait plus.
 */
function contractVariablesFrom(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("cvar:") || typeof value !== "string") continue;
    const name = key.slice(5);
    if (!/^[A-Z0-9_]{1,60}$/.test(name)) continue;
    const base = String(formData.get(`cbase:${name}`) ?? "");
    if (value.trim() !== base.trim()) out[name] = value.slice(0, 2000);
  }
  return out;
}

/** `slug:quantité, slug:quantité` — la forme que pose l'éditeur de kit. */
function kitLines(raw: string): { slug: string; qty: number }[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [slug, qty] = part.split(":");
      return { slug: slug.trim(), qty: Math.min(20, Math.max(1, Number(qty) || 1)) };
    })
    .filter((l) => l.slug);
}

export async function saveCampaignAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { booleans: ["enabled", "deductStock", "prototype"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const influencer = await getInfluencer(d.influencerId);
  if (!influencer) return failed("Partenaire inconnu");
  const existing = d.id ? await getCampaign(d.id) : null;
  if (d.id && !existing) return failed("Campagne introuvable");
  if (existing && existing.influencerId !== influencer.id) return failed("Cette campagne appartient à un autre partenaire.");

  const lines = kitLines(d.lines);
  if (d.enabled && lines.length === 0) return failed("Choisissez au moins un livre avant de proposer le kit.", { lines: "Sélection vide" });

  const campaign = await upsertCampaign({
    ...(existing ?? {}),
    id: existing?.id,
    influencerId: influencer.id,
    name: d.name,
    collaborationType: d.collaborationType,
    contractId: d.contractId,
    contractVariables: contractVariablesFrom(formData),
    kit: { enabled: d.enabled, title: d.title, text: d.text, lines, deductStock: d.deductStock, prototype: d.prototype },
    kitOrderId: existing?.kitOrderId ?? "",
    signatureId: existing?.signatureId ?? "",
    status: existing?.status ?? "draft",
  });

  await audit(user.email, existing ? "campaign.update" : "campaign.create", `campaigns/${campaign.id}`, `${influencer.name} · campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${influencer.id}`);
  revalidatePath("/partenaire");
  return saved(`Campagne n° ${campaign.seq} enregistrée${d.enabled ? "" : " (kit non proposé)"}.`);
}

/*
 * Ouvre une campagne vide. Elle n'attend rien du formulaire : on la crée d'un clic,
 * puis on la remplit dans son bloc — c'est plus près du geste qu'on a en tête quand on
 * se dit « je relance untel à l'automne ».
 */
export async function createCampaignAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const influencerId = String(formData.get("influencerId") ?? "");
  const influencer = await getInfluencer(influencerId);
  if (!influencer) return failed("Partenaire inconnu");

  /* Une campagne encore vide en attente : inutile d'en empiler une seconde. */
  const list = await listCampaigns(influencerId);
  const blank = list.find((c) => c.status === "draft" && c.kit.lines.length === 0 && !c.contractId);
  if (blank) return failed("Une campagne vide est déjà ouverte : remplissez-la plutôt que d'en créer une autre.");

  const campaign = await upsertCampaign({
    influencerId,
    name: "",
    collaborationType: influencer.collaborationType,
    contractId: "",
    contractVariables: {},
    kit: { enabled: false, title: "Votre kit de bienvenue", text: "", lines: [], deductStock: false, prototype: false },
    kitOrderId: "",
    signatureId: "",
    status: "draft",
  });
  await audit(user.email, "campaign.create", `campaigns/${campaign.id}`, `${influencer.name} · campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${influencerId}`);
  return saved(`Campagne n° ${campaign.seq} ouverte.`);
}

/*
 * Clôt une campagne. Le contrat signé la suit : il passe « terminé », sans disparaître.
 * Le partenaire retrouve alors une page sans kit à commander — jusqu'à la suivante.
 */
export async function completeCampaignAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const campaign = await getCampaign(id);
  if (!campaign) return failed("Campagne introuvable");

  const signature = await getSignature(campaign.signatureId);
  if (signature?.state === "active") await setSignatureState(signature.id, "completed").catch(() => undefined);
  await upsertCampaign({ ...campaign, status: "completed", completedAt: Date.now() });

  await audit(user.email, "campaign.complete", `campaigns/${id}`, `campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
  revalidatePath("/partenaire");
  return saved(`Campagne n° ${campaign.seq} terminée.`);
}

/*
 * Supprime une campagne. Refusé dès qu'elle a produit quelque chose : une commande
 * partie ou un contrat signé sont des faits, ils ne s'effacent pas d'un bouton. Pour
 * défaire une collaboration engagée, on supprime la commande du kit — ce qui annule le
 * contrat en le conservant (voir actions/orders.ts).
 */
export async function deleteCampaignAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const campaign = await getCampaign(id);
  if (!campaign) return failed("Campagne introuvable");
  if (campaign.kitOrderId || campaign.signatureId) {
    return failed("Cette campagne a déjà un kit commandé ou un contrat signé : supprimez la commande pour l'annuler.");
  }

  await deleteCampaign(id);
  await audit(user.email, "campaign.delete", `campaigns/${id}`, `campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
  revalidatePath("/partenaire");
  return saved(`Campagne n° ${campaign.seq} supprimée.`);
}
