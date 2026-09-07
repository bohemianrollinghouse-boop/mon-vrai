"use server";

import { z } from "zod";
import { saveContactMessage } from "@/lib/db/content";

/*
 * Formulaire de contact. Le message est enregistré en base — la boîte de réception de
 * l'admin — et, quand une clé Resend existe, transmis par e-mail. Sans clé, il reste
 * consultable dans l'admin : rien ne se perd.
 */

export type ContactResult = { ok: true } | { ok: false; error: string };

const Input = z.object({
  name: z.string().trim().max(120).default(""),
  email: z.email("Adresse e-mail invalide"),
  phone: z.string().trim().max(40).default(""),
  subject: z.string().trim().max(60).default(""),
  body: z.string().trim().min(10, "Dites-nous en un peu plus (10 caractères minimum)").max(5000),
  // Champ invisible pour les humains : un robot qui le remplit se trahit.
  website: z.string().max(0).default(""),
});

export async function sendContactMessage(formData: FormData): Promise<ContactResult> {
  const parsed = Input.safeParse({
    name: formData.get("name") ?? "",
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: formData.get("phone") ?? "",
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const { website, ...message } = parsed.data;
  void website;
  await saveContactMessage(message);
  await forwardByEmail(message).catch((err) => console.warn("[contact] e-mail non envoyé :", err));
  return { ok: true };
}

async function forwardByEmail(m: { name: string; email: string; phone: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_INBOX ?? process.env.EMAIL_FROM;
  if (!key || !to) return;
  const { Resend } = await import("resend");
  await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM ?? "Mon Vrai <bonjour@monvrai.fr>",
    to,
    replyTo: m.email,
    subject: `[Contact] ${m.subject || "Message"} — ${m.name || m.email}`,
    text: `${m.name}\n${m.email}\n${m.phone}\n\n${m.body}`,
  });
}
