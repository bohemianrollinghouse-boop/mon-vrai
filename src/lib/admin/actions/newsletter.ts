"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { resolveAudience, saveTemplateValues, type Audience } from "@/lib/db/newsletter";
import { prepareCrops, renderNewsletter } from "@/lib/email/newsletter";
import { sendNewsletterBatch } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/newsletter/unsub";
import { templateById } from "@/lib/newsletter/render";

/*
 * Newsletter par modèles : on enregistre les textes/images d'un modèle, et on l'envoie à
 * l'audience choisie (une adresse en test, tous les inscrits, les acheteurs, ou les
 * acheteurs d'un titre). Le gabarit riche est fixe ; chaque destinataire a son lien de
 * désinscription signé.
 */

/*
 * Les modifications d'un modèle (textes édités en ligne + images remplacées) arrivent en
 * un seul blob JSON `values` : clés nues pour les textes, préfixe « img: » pour les images.
 */
function valuesFrom(formData: FormData): Record<string, string> {
  try {
    const parsed = JSON.parse(String(formData.get("values") ?? "{}")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export async function saveNewsletterTemplateAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  const def = templateById(templateId);
  if (!def) return failed("Modèle inconnu.");
  await saveTemplateValues(templateId, valuesFrom(formData));
  await audit(user.email, "newsletter.template", `content/newsletter#${templateId}`);
  revalidatePath("/admin/newsletter");
  return saved(`Modèle « ${def.label} » enregistré.`);
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
}

function audienceFrom(formData: FormData): Audience {
  const kind = String(formData.get("kind") ?? "all");
  if (kind === "one") return { kind: "one", email: String(formData.get("email") ?? "").trim().toLowerCase() };
  if (kind === "buyers") return { kind: "buyers" };
  if (kind === "product") return { kind: "product", slug: String(formData.get("slug") ?? "") };
  return { kind: "all" };
}

export async function sendNewsletterAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  const def = templateById(templateId);
  if (!def) return failed("Modèle inconnu.");

  const audience = audienceFrom(formData);
  if (audience.kind === "one" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(audience.email)) return failed("Adresse e-mail invalide.", { email: "Invalide" });
  if (audience.kind === "product" && !audience.slug) return failed("Choisissez un titre.", { slug: "Requis" });

  const values = valuesFrom(formData);
  if (!values.subject?.trim()) return failed("Renseignez le sujet de l'e-mail.");

  // On enregistre au passage ce qui est envoyé, pour le retrouver tel quel plus tard.
  await saveTemplateValues(templateId, values).catch(() => undefined);

  const settings = await getSettings();
  const recipients = await resolveAudience(audience);
  if (recipients.length === 0) return failed("Aucun destinataire pour cette sélection.");

  const base = siteUrl();
  // Les images sont taillées UNE fois pour l'envoi entier : le contenu est le même pour
  // tout le monde, seul le lien de désinscription change d'un destinataire à l'autre.
  const crops = await prepareCrops(templateId, values, settings);
  const items = recipients.map((r) => {
    const url = unsubscribeUrl(base, r.email);
    const built = renderNewsletter(templateId, values, settings, url, crops);
    return { to: r.email, subject: built.subject, html: built.html, text: built.text, unsubscribeUrl: url };
  });

  const res = await sendNewsletterBatch(items);
  await audit(user.email, "newsletter.send", `content/newsletter#${templateId}`, `${audience.kind} · ${res.sent}/${recipients.length}`);
  if (res.skipped) return failed("Envoi impossible : la clé Resend n'est pas configurée.");
  const label = audience.kind === "one" ? audience.email : audience.kind === "buyers" ? "les acheteurs inscrits" : audience.kind === "product" ? `les acheteurs inscrits de ${audience.slug}` : "tous les inscrits";
  return saved(`« ${def.label} » envoyée à ${label} : ${res.sent} envoyé(s)${res.failed ? `, ${res.failed} en échec` : ""}.`);
}
