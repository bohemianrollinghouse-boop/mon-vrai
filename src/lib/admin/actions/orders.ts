"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getOrder, setTracking, transitionOrder } from "@/lib/db/orders";
import { OrderStatus } from "@/lib/domain/types";
import { sendShippingNotice } from "@/lib/email/send";
import { issueInvoice } from "@/lib/invoice/issue";

/*
 * Commandes. Trois gestes : changer le statut (en respectant la machine à états),
 * renseigner le suivi (qui passe la commande en « expédiée » et prévient le client),
 * émettre la facture (numéro + PDF). Aucune écriture directe : tout passe par les
 * transactions de db/orders.ts.
 */

const Transition = z.object({ id: z.string().min(1), to: OrderStatus, note: z.string().trim().max(500).default("") });

export async function transitionOrderAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Transition, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  try {
    const order = await transitionOrder(parsed.data.id, parsed.data.to, { note: parsed.data.note || undefined, by: user.email });
    await audit(user.email, `order.${parsed.data.to}`, `orders/${order.id}`, parsed.data.note || undefined);
    revalidatePath("/admin/commandes");
    return saved(`Commande ${order.number} : ${parsed.data.to}.`);
  } catch (e) {
    return failed((e as Error).message);
  }
}

const Tracking = z.object({
  id: z.string().min(1),
  carrier: z.string().trim().min(1, "Transporteur requis").max(60),
  number: z.string().trim().min(1, "Numéro requis").max(80),
  url: z.string().trim().default(""),
  notify: z.boolean().default(true),
});

export async function setTrackingAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Tracking, formData, { booleans: ["notify"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const order = await getOrder(d.id);
  if (!order) return failed("Commande introuvable");

  await setTracking(d.id, { carrier: d.carrier, number: d.number, url: d.url || undefined });
  let updated = order;
  if (order.status === "paid" || order.status === "preparing") {
    if (order.status === "paid") await transitionOrder(d.id, "preparing", { by: user.email });
    updated = await transitionOrder(d.id, "shipped", { note: `${d.carrier} ${d.number}`, by: user.email });
  }
  if (d.notify) {
    const fresh = await getOrder(d.id);
    if (fresh) await sendShippingNotice(fresh).catch((err) => console.warn("[orders] e-mail d'expédition non envoyé :", err));
  }
  await audit(user.email, "order.tracking", `orders/${d.id}`, `${d.carrier} ${d.number}`);
  revalidatePath("/admin/commandes");
  return saved(`Suivi enregistré${updated.status === "shipped" ? ", commande expédiée" : ""}${d.notify ? ", client prévenu" : ""}.`);
}

export async function issueInvoiceAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return failed("Commande inconnue");
  try {
    const order = await issueInvoice(id);
    await audit(user.email, "order.invoice", `orders/${id}`, order.invoice?.number);
    revalidatePath("/admin/commandes");
    return saved(`Facture ${order.invoice?.number} émise.`);
  } catch (e) {
    return failed((e as Error).message);
  }
}
