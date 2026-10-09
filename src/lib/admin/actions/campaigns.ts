"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { contractVariablesFrom, dayStamp, kitLines } from "@/lib/admin/campaign-form";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { cleanUrl, publicationSlots } from "@/lib/admin/publications";
import { clockNow, deleteCampaign, getCampaign, listCampaigns, setCampaignPublications, syncCampaignPromo, upsertCampaign } from "@/lib/db/campaigns";
import { getContract, getSignature, setSignatureState } from "@/lib/db/contracts";
import { hasDeliverables } from "@/lib/db/deliverables";
import { refreshOutreach } from "@/lib/db/outreach";
import { getInfluencer, getPromo } from "@/lib/db/promos";
import { CollaborationType, EMPTY_QUOTA, type CampaignPublication } from "@/lib/domain/types";

/*
 * Les campagnes d'un partenaire.
 *
 * La fiche du partenaire décrit la personne ; une campagne décrit ce qu'on négocie avec
 * elle une fois : le kit offert, le contrat à signer, ses réglages. Il y en a autant
 * qu'on veut dans le temps, et une campagne passée n'est jamais réécrite — c'est ce qui
 * permet de retrouver, des deux côtés, ce qui avait été convenu l'an dernier.
 */

/** La page d'une campagne, et l'onglet d'où l'on vient. */
const campaignPath = (influencerId: string, campaignId: string) => `/admin/influenceurs/${influencerId}/campagnes/${campaignId}`;
const campaignsTab = (influencerId: string) => `/admin/influenceurs/${influencerId}?onglet=campagnes`;

const Input = z.object({
  id: z.string().default(""),
  influencerId: z.string().min(1),
  name: z.string().trim().max(80).default(""),
  collaborationType: CollaborationType.default("UGC"),
  /* Le code promo de la campagne, et la remise qu'il offre. */
  code: z.string().trim().max(24).default(""),
  discount: z.number().int().min(0).max(100).default(10),
  startAt: z.string().trim().default(""),
  endAt: z.string().trim().default(""),
  contractId: z.string().trim().default(""),
  /* Le kit, dans le même formulaire : il fait partie de ce qui se négocie. */
  enabled: z.boolean().default(false),
  deductStock: z.boolean().default(false),
  prototype: z.boolean().default(false),
  title: z.string().trim().max(80).default("Votre kit de bienvenue"),
  text: z.string().trim().max(400).default(""),
  /** Sélection sérialisée par l'éditeur : `slug:quantité`, séparés par des virgules. */
  lines: z.string().default(""),
  /* Ce qu'on attend en retour, en chiffres : c'est ce dont /admin retranche les fichiers
     reçus pour dire ce qui manque, et ce que le contrat cite ({{CONTENUS_ATTENDUS}}). */
  expectedPhotos: z.number().int().min(0).max(999).default(0),
  expectedVideos: z.number().int().min(0).max(999).default(0),
});

export async function saveCampaignAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["discount", "expectedPhotos", "expectedVideos"], booleans: ["enabled", "deductStock", "prototype"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const influencer = await getInfluencer(d.influencerId);
  if (!influencer) return failed("Partenaire inconnu");
  const existing = d.id ? await getCampaign(d.id) : null;
  if (d.id && !existing) return failed("Campagne introuvable");
  if (existing && existing.influencerId !== influencer.id) return failed("Cette campagne appartient à un autre partenaire.");

  const lines = kitLines(d.lines);
  if (d.enabled && lines.length === 0) return failed("Choisissez au moins un livre avant de proposer le kit.", { lines: "Sélection vide" });

  /*
   * Les dates ne sont pas décoratives : le code promo ne vaut qu'entre les deux, et le
   * contrat les cite. On les exige donc, dans cet ordre.
   */
  const startAt = dayStamp(d.startAt, "start");
  const endAt = dayStamp(d.endAt, "end");
  if (startAt === null) return failed("Indiquez la date de début de la campagne.", { startAt: "Date requise" });
  if (endAt === null) return failed("Indiquez la date de fin de la campagne.", { endAt: "Date requise" });
  if (endAt < startAt) return failed("La fin de campagne précède son début.", { endAt: "Après le début" });

  /*
   * Le code, s'il y en a un : il ne peut pas être celui d'un autre partenaire ni un code
   * promo interne. Deux campagnes du MÊME partenaire peuvent en revanche le partager —
   * une nouvelle campagne reprend par défaut celui de la précédente.
   */
  const code = d.code.toUpperCase();
  if (code && !/^[A-Z0-9]{2,24}$/.test(code)) return failed("Le code ne prend que des lettres et des chiffres, 2 au minimum.", { code: "Code invalide" });
  if (code) {
    const promo = await getPromo(code);
    if (promo && promo.influencerId !== influencer.id) {
      return failed(`Le code ${code} existe déjà${promo.influencerId ? " (autre partenaire)" : " (code promo interne)"}.`, { code: "Déjà utilisé" });
    }
  }

  const campaign = await upsertCampaign({
    ...(existing ?? {}),
    id: existing?.id,
    influencerId: influencer.id,
    /* Le rattachement à une campagne partagée ne se règle pas ici : il ne bouge pas. */
    operationId: existing?.operationId ?? "",
    name: d.name,
    collaborationType: d.collaborationType,
    code,
    discount: d.discount,
    startAt,
    endAt,
    contractId: d.contractId,
    contractVariables: contractVariablesFrom(formData),
    kit: { enabled: d.enabled, title: d.title, text: d.text, lines, deductStock: d.deductStock, prototype: d.prototype },
    expected: { photos: d.expectedPhotos, videos: d.expectedVideos },
    /* Ce qui a paru se constate ailleurs (savePublicationsAction) : ce formulaire ne le
       porte pas, il doit donc le laisser exactement où il est. */
    publications: existing?.publications ?? [],
    kitOrderId: existing?.kitOrderId ?? "",
    signatureId: existing?.signatureId ?? "",
    status: existing?.status ?? "draft",
  });

  /*
   * Le document promo est un reflet de la campagne : on le refait. L'ancien code aussi,
   * s'il a changé — il peut n'être plus porté par personne, et doit alors s'éteindre.
   */
  for (const c of new Set([code, existing?.code ?? ""].filter(Boolean))) {
    await syncCampaignPromo(influencer, c).catch((err) => console.warn("[campagne] code non synchronisé :", (err as Error).message));
  }

  await audit(user.email, existing ? "campaign.update" : "campaign.create", `campaigns/${campaign.id}`, `${influencer.name} · campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${influencer.id}`);
  revalidatePath(campaignPath(influencer.id, campaign.id));
  revalidatePath("/admin/codes-promo");
  revalidatePath("/partenaire");
  return saved(`Campagne n° ${campaign.seq} enregistrée${d.enabled ? "" : " (kit non proposé)"}.`);
}

/*
 * Ouvre une campagne vide, et l'ouvre au sens propre : on est aussitôt sur sa page,
 * prêt à la remplir. C'est plus près du geste qu'on a en tête quand on se dit « je
 * relance untel à l'automne ».
 */
export async function createCampaignAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const influencerId = String(formData.get("influencerId") ?? "");
  const influencer = await getInfluencer(influencerId);
  if (!influencer) return failed("Partenaire inconnu");

  /* Une campagne encore vide en attente : on y retourne plutôt que d'en empiler une. */
  const list = await listCampaigns(influencerId);
  const blank = list.find((c) => c.status === "draft" && c.kit.lines.length === 0 && !c.contractId);
  if (blank) return { ok: true, message: `Campagne n° ${blank.seq}, encore vide : à remplir.`, redirectTo: campaignPath(influencerId, blank.id) };

  /*
   * Une nouvelle campagne reprend ce qui se reconduit d'ordinaire : le même code promo,
   * la même remise, la même forme de collaboration. Tout reste modifiable — c'est un
   * point de départ, pas une règle.
   */
  const previous = list[0] ?? null;
  const campaign = await upsertCampaign({
    influencerId,
    /* Montée ici, donc pour lui seul : elle ne ressort d'aucune campagne partagée. */
    operationId: "",
    /* Rien n'a encore paru : la liste se remplira depuis le contrat, à la première case cochée. */
    publications: [],
    name: "",
    collaborationType: previous?.collaborationType ?? influencer.collaborationType,
    code: previous?.code ?? "",
    discount: previous?.discount ?? 10,
    startAt: Date.now(),
    endAt: undefined,
    contractId: "",
    contractVariables: {},
    kit: { enabled: false, title: "Votre kit de bienvenue", text: "", lines: [], deductStock: false, prototype: false },
    expected: previous?.expected ?? EMPTY_QUOTA,
    kitOrderId: "",
    signatureId: "",
    status: "draft",
  });
  await audit(user.email, "campaign.create", `campaigns/${campaign.id}`, `${influencer.name} · campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${influencerId}`);
  return { ok: true, message: `Campagne n° ${campaign.seq} ouverte.`, redirectTo: campaignPath(influencerId, campaign.id) };
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

  /* Campagne terminée, code éteint — sauf si une autre campagne vivante le porte aussi. */
  const influencer = await getInfluencer(campaign.influencerId);
  if (influencer && campaign.code) {
    await syncCampaignPromo(influencer, campaign.code).catch((err) => console.warn("[campagne] code non éteint :", (err as Error).message));
  }

  /* Plus de contrat qui court : le démarchage redescend de « collaboration » à « validé ». */
  await refreshOutreach(campaign.influencerId).catch(() => undefined);

  await audit(user.email, "campaign.complete", `campaigns/${id}`, `campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
  revalidatePath(campaignPath(campaign.influencerId, id));
  revalidatePath("/admin/codes-promo");
  revalidatePath("/partenaire");
  return saved(`Campagne n° ${campaign.seq} terminée${campaign.code ? ` · le code ${campaign.code} ne remise plus` : ""}.`);
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
  /* Des contenus sont au dossier : les effacer avec la campagne, ce serait jeter ce
     qu'on a reçu d'une main qu'on ne peut pas redemander. On retire d'abord. */
  if (await hasDeliverables(campaign.id)) {
    return failed("Des contenus ont été déposés sur cette campagne : retirez-les d'abord si vous voulez vraiment la supprimer.");
  }

  await deleteCampaign(id);
  const owner = await getInfluencer(campaign.influencerId);
  if (owner && campaign.code) await syncCampaignPromo(owner, campaign.code).catch(() => undefined);
  await audit(user.email, "campaign.delete", `campaigns/${id}`, `campagne n° ${campaign.seq}`);
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
  revalidatePath("/admin/codes-promo");
  revalidatePath("/partenaire");
  /*
   * Redirection côté serveur, et non `redirectTo` : une action serveur invalide la
   * route courante, qui est ici la campagne qu'on vient d'effacer — elle se rendrait
   * en 404 le temps que la redirection aboutisse.
   */
  redirect(campaignsTab(campaign.influencerId));
}

/*
 * Ce qui a paru : les cases cochées et les adresses collées sous elles.
 *
 * Le contrat fait foi sur ce qui est DÛ — la liste est relue en base, et rien de ce que
 * le client poste pour une ligne inconnue n'est retenu. Ce que la campagne portait pour
 * une ligne depuis retirée du contrat n'est pas affiché mais n'est pas jeté non plus :
 * rétablir la ligne ramène ses liens, et une parution faite reste une parution faite.
 */
export async function savePublicationsAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const campaign = await getCampaign(String(formData.get("campaignId") ?? ""));
  if (!campaign) return failed("Campagne introuvable");

  const contract = campaign.contractId ? await getContract(campaign.contractId) : null;
  const slots = publicationSlots(contract?.publications ?? [], campaign.publications);
  if (slots.length === 0) return failed("Ce contrat n'exige aucune parution.");

  const was = new Map(campaign.publications.map((p) => [p.key, p]));
  const at = await clockNow();
  const next: CampaignPublication[] = [];
  for (const slot of slots) {
    const url = cleanUrl(String(formData.get(`url:${slot.key}`) ?? ""));
    if (url === null) {
      return failed(`L'adresse de « ${slot.label} » doit commencer par https://`, { [`url:${slot.key}`]: "Adresse invalide" });
    }
    /* Un lien vaut la preuve : collé sous une case décochée, il la coche. */
    const done = formData.getAll(`done:${slot.key}`).includes("true") || Boolean(url);
    /* Rien de constaté, rien d'écrit : la campagne ne porte que ce qui a eu lieu. */
    if (!done) continue;
    next.push({ key: slot.key, done: true, url, at: was.get(slot.key)?.at ?? at });
  }

  const orphans = campaign.publications.filter((p) => !slots.some((s) => s.key === p.key));
  await setCampaignPublications(campaign.id, [...next, ...orphans]);
  await audit(user.email, "campaign.publications", `campaigns/${campaign.id}`, `${next.length} parution(s) sur ${slots.length}`);
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}/campagnes/${campaign.id}`);
  revalidatePath(`/admin/influenceurs/${campaign.influencerId}`);
  return saved(`${next.length} parution${next.length > 1 ? "s" : ""} sur ${slots.length} enregistrée${next.length > 1 ? "s" : ""}.`);
}
