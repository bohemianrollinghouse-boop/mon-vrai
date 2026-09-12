"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { resolveAudience, saveTemplateValues, type Audience } from "@/lib/db/newsletter";
import { renderNewsletter } from "@/lib/email/newsletter";
import { sendNewsletterBatch } from "@/lib/email/send";
import { getNewsletterSend, recordNewsletterSend, saveNewsletterSendStats } from "@/lib/db/newsletter-sends";
import { fetchSendStats } from "@/lib/email/metrics";
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
  const items = recipients.map((r) => {
    const url = unsubscribeUrl(base, r.email);
    const built = renderNewsletter(templateId, values, settings, url);
    return { to: r.email, subject: built.subject, html: built.html, text: built.text, unsubscribeUrl: url };
  });

  const res = await sendNewsletterBatch(items);
  await audit(user.email, "newsletter.send", `content/newsletter#${templateId}`, `${audience.kind} · ${res.sent}/${recipients.length}`);
  if (res.skipped) return failed("Envoi impossible : la clé Resend n'est pas configurée.");

  const label = audience.kind === "one" ? audience.email : audience.kind === "buyers" ? "les acheteurs inscrits" : audience.kind === "product" ? `les acheteurs inscrits de ${audience.slug}` : "tous les inscrits";
  /* L'envoi est consigné : c'est la seule trace, et les identifiants Resend qu'il garde
     sont la seule façon de relire plus tard combien de messages sont arrivés. */
  await recordNewsletterSend({
    templateId,
    templateLabel: def.label,
    subject: values.subject.trim(),
    audience: label,
    recipients: recipients.length,
    accepted: res.sent,
    failed: res.failed,
    emailIds: res.ids,
    by: user.email,
  }).catch((err) => console.warn("[newsletter] envoi non consigné :", (err as Error).message));

  revalidatePath("/admin/newsletter");
  return saved(`« ${def.label} » envoyée à ${label} : ${res.sent} envoyé(s)${res.failed ? `, ${res.failed} en échec` : ""}.`);
}

/*
 * Relève auprès de Resend ce que sont devenus les e-mails d'un envoi. À la demande :
 * les accusés arrivent sur plusieurs heures, et rien ne sert d'interroger l'API à
 * chaque affichage de la page.
 */
export async function refreshNewsletterStatsAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return failed("Envoi inconnu");

  const send = await getNewsletterSend(id);
  if (!send) return failed("Envoi introuvable");

  const outcome = await fetchSendStats(send.emailIds, send.sentAt);
  await saveNewsletterSendStats(id, outcome.ok ? outcome.stats : null, outcome.ok ? "" : outcome.error);
  await audit(user.email, "newsletter.stats", `newsletterSends/${id}`, outcome.ok ? `${outcome.stats.delivered}/${send.accepted}` : outcome.error);
  revalidatePath("/admin/newsletter");
  if (!outcome.ok) return failed(outcome.error);
  return saved(`${outcome.stats.delivered} message${outcome.stats.delivered > 1 ? "s" : ""} remis sur ${send.accepted} envoyé${send.accepted > 1 ? "s" : ""}.`);
}
