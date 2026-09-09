import "server-only";
import { getSettings } from "@/lib/db/settings";
import type { Order } from "@/lib/domain/types";
import { storage } from "@/lib/firebase/admin";
import { contactForwardEmail, orderConfirmationEmail, shippingNoticeEmail, type BuiltEmail } from "./templates";

/*
 * Envoi des e-mails transactionnels, habillés (voir templates.ts). Sans clé Resend, on
 * journalise au lieu d'envoyer : le flux reste testable en développement et rien ne
 * casse en production si la clé manque — on le voit dans les logs.
 */

type Attachment = { filename: string; content: Buffer };
type Mail = BuiltEmail & { to: string; attachments?: Attachment[]; replyTo?: string };

export async function deliver(mail: Mail): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Mon Vrai <no-reply@monvrai.fr>";
  if (!key) {
    const pj = mail.attachments?.length ? ` [+ ${mail.attachments.map((a) => a.filename).join(", ")}]` : "";
    console.info(`[email] (non envoyé, pas de clé) → ${mail.to} : ${mail.subject}${pj}`);
    return { ok: false, skipped: true };
  }
  const { Resend } = await import("resend");
  const { error } = await new Resend(key).emails.send({ from, to: mail.to, replyTo: mail.replyTo, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments });
  if (error) throw new Error(`Resend : ${error.message}`);
  return { ok: true };
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr";
}

async function invoiceAttachment(order: Order): Promise<Attachment[] | undefined> {
  if (!order.invoice?.storagePath) return undefined;
  const [content] = await storage().bucket().file(order.invoice.storagePath).download();
  return [{ filename: `${order.invoice.number}.pdf`, content }];
}

export async function sendOrderConfirmation(order: Order): Promise<void> {
  const settings = await getSettings();
  const built = orderConfirmationEmail(order, settings, siteUrl());
  // Expéditeur no-reply, mais une réponse doit atteindre la boutique : Reply-To vers l'e-mail de contact.
  await deliver({ to: order.email, replyTo: replyTo(settings), ...built, attachments: await invoiceAttachment(order) });
}

export async function sendShippingNotice(order: Order): Promise<void> {
  const settings = await getSettings();
  await deliver({ to: order.email, replyTo: replyTo(settings), ...shippingNoticeEmail(order, settings, siteUrl()) });
}

function replyTo(settings: { contact: { email?: string } }): string | undefined {
  return settings.contact.email ?? process.env.CONTACT_INBOX ?? undefined;
}

export async function sendContactForward(message: { name: string; email: string; phone: string; subject: string; body: string }): Promise<void> {
  const to = process.env.CONTACT_INBOX ?? process.env.EMAIL_FROM;
  if (!to) return;
  const settings = await getSettings();
  await deliver({ to, replyTo: message.email, ...contactForwardEmail(message, settings) });
}
