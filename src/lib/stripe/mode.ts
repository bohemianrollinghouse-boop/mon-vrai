import "server-only";
import { getSettings } from "@/lib/db/settings";
import type { PaymentMode } from "./client";

/** Mode de paiement choisi dans l'admin. Par défaut « live » : un réglage absent ne doit jamais faire basculer en test. */
export async function getPaymentMode(): Promise<PaymentMode> {
  const settings = await getSettings();
  return settings.payments.mode;
}
