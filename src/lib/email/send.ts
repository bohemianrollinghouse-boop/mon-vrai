import "server-only";
import { formatEuro } from "@/lib/domain/money";
import type { Order } from "@/lib/domain/types";
import { storage } from "@/lib/firebase/admin";

/*
 * E-mails transactionnels. Sans clé Resend, on journalise le message au lieu de
 * l'envoyer : le flux reste testable de bout en bout en développement, et rien ne
 * casse en production si la clé manque — on le voit dans les logs.
 */

type Mail = { to: string; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; content: Buffer }> };

async function deliver(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Mon Vrai <bonjour@monvrai.fr>";
  if (!key) {
    const pj = mail.attachments?.length ? ` [+ ${mail.attachments.map((a) => a.filename).join(", ")}]` : "";
    console.info(`[email] (non envoyé, pas de clé) → ${mail.to} : ${mail.subject}${pj}\n${mail.text}`);
    return;
  }
  const { Resend } = await import("resend");
  const { error } = await new Resend(key).emails.send({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments });
  if (error) throw new Error(`Resend : ${error.message}`);
}

export async function sendOrderConfirmation(order: Order): Promise<void> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const lines = order.lines.map((l) => `• ${l.title} × ${l.qty} — ${formatEuro(l.unitPrice * l.qty)}`).join("\n");
  const preorder = order.lines.some((l) => l.preorder);
  const text = [
    `Merci pour votre commande ${order.number} !`,
    "",
    lines,
    "",
    `Sous-total : ${formatEuro(order.totals.subtotal)}`,
    `Livraison : ${order.totals.shipping === 0 ? "offerte" : formatEuro(order.totals.shipping)}`,
    order.totals.discount ? `Remise : −${formatEuro(order.totals.discount)}` : null,
    `Total : ${formatEuro(order.totals.total)}`,
    "",
    `Livraison à : ${order.shippingAddress.name}, ${order.shippingAddress.line1}${order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}, ${order.shippingAddress.postalCode} ${order.shippingAddress.city}`,
    "",
    preorder ? "Il s'agit d'une précommande : nous vous préviendrons dès l'expédition." : "Nous préparons votre colis et vous préviendrons dès l'expédition.",
    order.invoice ? `Votre facture ${order.invoice.number} est jointe à cet e-mail.` : null,
    site ? `Suivre ma commande : ${site}/compte` : null,
    "",
    "Grandir avec du vrai.",
    "Mon Vrai",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  // La facture voyage avec la confirmation : un acheteur sans compte n'a pas d'autre
  // moyen de la récupérer.
  const attachments = order.invoice?.storagePath ? [{ filename: `${order.invoice.number}.pdf`, content: (await storage().bucket().file(order.invoice.storagePath).download())[0] }] : undefined;
  await deliver({ to: order.email, subject: `Votre commande ${order.number} — Mon Vrai`, text, attachments });
}

export async function sendShippingNotice(order: Order): Promise<void> {
  const t = order.tracking;
  const text = [
    `Bonne nouvelle : votre commande ${order.number} est en route.`,
    t ? `Transporteur : ${t.carrier} · n° ${t.number}${t.url ? `\nSuivi : ${t.url}` : ""}` : null,
    "",
    "Mon Vrai",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  await deliver({ to: order.email, subject: `Votre commande ${order.number} est expédiée`, text });
}
