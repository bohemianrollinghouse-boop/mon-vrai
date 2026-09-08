import "server-only";
import { storage } from "@/lib/firebase/admin";
import { getOrder, setBoxtal, setTracking, transitionOrder } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";
import type { Order } from "@/lib/domain/types";
import { sendShippingNotice } from "@/lib/email/send";
import { carrierOf } from "./offers";
import { createShippingOrder, getShippingDocuments, getShippingTracking, type PackageTracking } from "./client";
import { buildShippingOrderRequest } from "./request";

export { buildShippingOrderRequest, parcelWeightKg, senderAddress } from "./request";

/*
 * Du côté commande : construire la demande Boxtal à partir de la commande et des
 * réglages, l'envoyer, puis intégrer ce que Boxtal renvoie (étiquette, suivi), que ce
 * soit à la demande (bouton admin) ou par webhook.
 */

/** Crée l'expédition chez Boxtal pour une commande payée, passe la commande en préparation. */
export async function createLabelForOrder(orderId: string, by: string): Promise<Order> {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Commande introuvable");
  if (order.boxtal?.orderId) return order;
  if (!["paid", "preparing"].includes(order.status)) throw new Error(`Une commande ${order.status} ne s'expédie pas.`);
  const settings = await getSettings();
  const req = buildShippingOrderRequest(order, settings);
  const created = await createShippingOrder(req);
  await setBoxtal(orderId, { orderId: created.id, status: created.status, createdAt: Date.now(), updatedAt: Date.now() });
  if (order.status === "paid") await transitionOrder(orderId, "preparing", { note: `Étiquette Boxtal demandée (${req.shippingOfferCode}, réf. ${created.id})`, by });
  // L'étiquette et le suivi arrivent souvent tout de suite : on tente, sans dépendre du webhook.
  await syncBoxtal(orderId).catch((err) => console.warn("[boxtal] synchro après création :", err));
  return (await getOrder(orderId)) ?? order;
}

/** Relit documents et suivi chez Boxtal et met la commande à jour (appelé par l'admin et le webhook). */
export async function syncBoxtal(orderId: string): Promise<Order | null> {
  const order = await getOrder(orderId);
  if (!order?.boxtal) return order;
  const [docs, trackings] = await Promise.all([getShippingDocuments(order.boxtal.orderId).catch(() => []), getShippingTracking(order.boxtal.orderId).catch(() => [])]);
  const patch: NonNullable<Order["boxtal"]> = { ...order.boxtal, updatedAt: Date.now() };

  const label = docs.find((d) => d.type === "LABEL");
  if (label && !order.boxtal.labelPath) {
    patch.labelPath = await archiveLabel(order, label.url).catch((err) => {
      console.warn("[boxtal] archivage étiquette :", err);
      return undefined;
    });
    if (patch.labelPath) patch.status = "CONFIRMED";
  }

  const t = trackings[0];
  if (t) applyTracking(patch, t);
  await setBoxtal(orderId, patch);

  if (t?.trackingNumber && !order.tracking) {
    await setTracking(orderId, { carrier: carrierOf(order.delivery?.offerCode ?? ""), number: t.trackingNumber, url: t.packageTrackingUrl || undefined });
  }
  await advanceStatus(orderId, t?.status);
  return getOrder(orderId);
}

function applyTracking(patch: NonNullable<Order["boxtal"]>, t: PackageTracking) {
  if (t.trackingNumber) patch.trackingNumber = t.trackingNumber;
  if (t.packageTrackingUrl) patch.trackingUrl = t.packageTrackingUrl;
  if (t.status) patch.trackingStatus = t.status;
  if (t.message) patch.trackingMessage = t.message;
}

/** Le suivi transporteur fait avancer la commande : expédiée dès la prise en charge, livrée à la livraison. */
async function advanceStatus(orderId: string, trackingStatus: string | undefined) {
  if (!trackingStatus) return;
  const order = await getOrder(orderId);
  if (!order) return;
  const shippedStatuses = ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED_ATTEMPT", "REACHED_DELIVERY_PICKUP_POINT"];
  if (shippedStatuses.includes(trackingStatus) && ["paid", "preparing"].includes(order.status)) {
    if (order.status === "paid") await transitionOrder(orderId, "preparing", { by: "boxtal" });
    await transitionOrder(orderId, "shipped", { note: `Suivi Boxtal : ${trackingStatus}`, by: "boxtal" });
    const fresh = await getOrder(orderId);
    if (fresh?.tracking) await sendShippingNotice(fresh).catch((err) => console.warn("[boxtal] e-mail d'expédition :", err));
  } else if (trackingStatus === "DELIVERED" && ["paid", "preparing", "shipped"].includes(order.status)) {
    if (order.status === "paid") await transitionOrder(orderId, "preparing", { by: "boxtal" });
    if (order.status !== "shipped") await transitionOrder(orderId, "shipped", { by: "boxtal" });
    await transitionOrder(orderId, "delivered", { note: "Livrée (suivi Boxtal)", by: "boxtal" });
  }
}

/** L'URL Boxtal du bordereau expire : on copie le PDF dans le bucket, sous un chemin privé. */
async function archiveLabel(order: Order, url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`téléchargement étiquette → ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const path = `labels/${new Date(order.createdAt).getFullYear()}/${order.number}.pdf`;
  await storage().bucket().file(path).save(bytes, { contentType: "application/pdf", metadata: { cacheControl: "private, max-age=0" } });
  return path;
}

export async function readLabel(order: Order): Promise<Buffer | null> {
  if (!order.boxtal?.labelPath) return null;
  const [bytes] = await storage().bucket().file(order.boxtal.labelPath).download();
  return bytes;
}
