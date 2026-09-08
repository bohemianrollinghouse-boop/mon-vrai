"use server";

import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/settings";
import { deliver } from "@/lib/email/send";
import { sampleOrder } from "@/lib/email/sample";
import { orderConfirmationEmail, shippingNoticeEmail } from "@/lib/email/templates";

/** Envoi d'un e-mail de test (données fictives) à une adresse choisie, pour vérifier le rendu. */
const Input = z.object({ template: z.enum(["confirmation", "shipping"]), to: z.email("Adresse invalide") });

export async function sendTestEmailAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const settings = await getSettings();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr";
  const order = sampleOrder();
  const built = parsed.data.template === "confirmation" ? orderConfirmationEmail(order, settings, site) : shippingNoticeEmail(order, settings, site);
  try {
    const res = await deliver({ to: parsed.data.to, ...built });
    if (res.skipped) return failed("Aucune clé Resend configurée : l'e-mail n'a pas été envoyé (visible dans les logs).");
    await audit(user.email, "email.test", `email/${parsed.data.template}`, parsed.data.to);
    return saved(`E-mail de test envoyé à ${parsed.data.to}.`);
  } catch (e) {
    return failed((e as Error).message);
  }
}
