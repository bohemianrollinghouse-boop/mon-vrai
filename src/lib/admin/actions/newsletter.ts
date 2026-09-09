"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getNewsletterContent, resolveAudience, saveNewsletterContent, type Audience } from "@/lib/db/newsletter";
import { getSettings } from "@/lib/db/settings";
import { newsletterEmail } from "@/lib/email/newsletter";
import { sendNewsletterBatch } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/newsletter/unsub";

/*
 * Newsletter : enregistrement du contenu éditable, et envoi ciblé (tout le monde, les
 * acheteurs d'un titre, ou une seule adresse). Le gabarit est fixe (email/newsletter.ts) ;
 * chaque destinataire reçoit son lien de désinscription signé.
 */

const ContentInput = z.object({
  subject: z.string().trim().max(150).default(""),
  eyebrow: z.string().trim().max(60).default(""),
  heading: z.string().trim().max(120).default(""),
  body: z.string().max(8000).default(""),
  cta: z.object({ label: z.string().trim().max(60).default(""), href: z.string().trim().max(300).default("") }),
  imageUrl: z.string().trim().max(500).default(""),
});

export async function saveNewsletterContentAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(ContentInput, formData, {});
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  await saveNewsletterContent(parsed.data);
  await audit(user.email, "newsletter.content", "content/newsletter");
  revalidatePath("/admin/newsletter");
  return saved("Contenu de la newsletter enregistré.");
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
  const audience = audienceFrom(formData);
  if (audience.kind === "one" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(audience.email)) return failed("Adresse e-mail invalide.", { email: "Invalide" });
  if (audience.kind === "product" && !audience.slug) return failed("Choisissez un titre.", { slug: "Requis" });

  const [content, settings] = await Promise.all([getNewsletterContent(), getSettings()]);
  if (!content.subject.trim() && !content.heading.trim()) return failed("Renseignez au moins un sujet ou un titre avant d'envoyer.");
  if (!content.body.trim()) return failed("Le corps de la newsletter est vide.");

  const recipients = await resolveAudience(audience);
  if (recipients.length === 0) return failed("Aucun destinataire pour cette sélection.");

  const base = siteUrl();
  const items = recipients.map((r) => {
    const built = newsletterEmail(content, settings, unsubscribeUrl(base, r.email));
    return { to: r.email, subject: built.subject, html: built.html, text: built.text, unsubscribeUrl: unsubscribeUrl(base, r.email) };
  });

  const res = await sendNewsletterBatch(items);
  await audit(user.email, "newsletter.send", "content/newsletter", `${audience.kind} · ${res.sent}/${recipients.length}`);
  if (res.skipped) return failed("Envoi impossible : la clé Resend n'est pas configurée.");
  const label = audience.kind === "one" ? audience.email : audience.kind === "buyers" ? "les acheteurs" : audience.kind === "product" ? `les acheteurs de ${audience.slug}` : "tous les inscrits";
  return saved(`Newsletter envoyée à ${label} : ${res.sent} envoyé(s)${res.failed ? `, ${res.failed} en échec` : ""}.`);
}
