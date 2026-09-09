"use server";

import { z } from "zod";
import { subscribeEmail } from "@/lib/db/newsletter";

/*
 * Inscription newsletter. On enregistre l'adresse avec la date et l'origine : c'est la
 * preuve de consentement que le RGPD demande. L'envoi lui-même passera par l'outil
 * d'e-mailing, alimenté depuis cette collection.
 */

export type NewsletterResult = { ok: true } | { ok: false; error: string };

const Input = z.object({ email: z.email("Adresse e-mail invalide"), source: z.string().max(40).default("site") });

export async function subscribeNewsletter(formData: FormData): Promise<NewsletterResult> {
  const parsed = Input.safeParse({ email: String(formData.get("email") ?? "").trim().toLowerCase(), source: formData.get("source") ?? "site" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Adresse invalide" };

  const { email, source } = parsed.data;
  await subscribeEmail(email, source);
  return { ok: true };
}
