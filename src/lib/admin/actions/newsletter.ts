"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { resolveAudience, saveTemplateValues, type Audience } from "@/lib/db/newsletter";
import { renderNewsletter } from "@/lib/email/newsletter";
import { sendNewsletterBatch } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/newsletter/unsub";
import { templateById } from "@/lib/newsletter/templates";

/*
 * Newsletter par modèles : on enregistre les textes/images d'un modèle, et on l'envoie à
 * l'audience choisie (une adresse en test, tous les inscrits, les acheteurs, ou les
 * acheteurs d'un titre). Le gabarit riche est fixe ; chaque destinataire a son lien de
 * désinscription signé.
 */

/** Récupère, depuis le formulaire, les valeurs des champs déclarés par le modèle. */
function valuesFrom(formData: FormData, templateId: string): Record<string, string> {
  const def = templateById(templateId);
  const out: Record<string, string> = {};
  for (const field of def?.fields ?? []) out[field.name] = String(formData.get(field.name) ?? "");
  return out;
}

export async function saveNewsletterTemplateAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  const def = templateById(templateId);
  if (!def) return failed("Modèle inconnu.");
  await saveTemplateValues(templateId, valuesFrom(formData, templateId));
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

  const values = valuesFrom(formData, templateId);
  if (!values.subject?.trim()) return failed("Renseignez le sujet de l'e-mail.");
  if (!values.intro?.trim() && !values.title?.trim()) return failed("Le contenu du modèle est vide.");

  // On enregistre au passage ce qui est envoyé, pour le retrouver tel quel plus tard.
  await saveTemplateValues(templateId, values).catch(() => undefined);

  const settings = await getSettings();
  const recipients = await resolveAudience(audience);
  if (recipients.length === 0) return failed("Aucun destinataire pour cette sélection.");

  const base = siteUrl();
  const items = recipients.map((r) => {
    const url = unsubscribeUrl(base, r.email);
    const built = renderNewsletter(templateId, values, settings, url);
    return { to: r.email, subject: built.subject, html: built.html, text: built.text, unsubscribeUrl: url };
  });

  const res = await sendNewsletterBatch(items);
  await audit(user.email, "newsletter.send", `content/newsletter#${templateId}`, `${audience.kind} · ${res.sent}/${recipients.length}`);
  if (res.skipped) return failed("Envoi impossible : la clé Resend n'est pas configurée.");
  const label = audience.kind === "one" ? audience.email : audience.kind === "buyers" ? "les acheteurs inscrits" : audience.kind === "product" ? `les acheteurs inscrits de ${audience.slug}` : "tous les inscrits";
  return saved(`« ${def.label} » envoyée à ${label} : ${res.sent} envoyé(s)${res.failed ? `, ${res.failed} en échec` : ""}.`);
}
