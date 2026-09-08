import type { Customer, Order } from "@/lib/domain/types";

/*
 * Corps envoyé au scénario Make qui crée le client et la facture dans Tiime. Format
 * fixé par Steve : montants en euros (nombres), prix unitaires HT — en franchise de
 * TVA, HT = prix de vente. `tiime_client_id` n'est présent que s'il est déjà connu.
 * La livraison et la remise deviennent des lignes pour que la somme égale le total.
 */

export type TiimePayload = {
  order_id: string;
  customer: {
    firestore_id: string;
    tiime_client_id?: number;
    email: string;
    name: string;
    address: string;
    zip: string;
    city: string;
    country: string;
    phone: string;
  };
  lines: { description: string; quantity: number; unit_price: number }[];
  total: number;
  test?: true;
};

const euros = (cents: number) => Math.round(cents) / 100;

export function buildTiimePayload(order: Order, customer: Customer | null): TiimePayload {
  const a = order.shippingAddress;
  const lines: TiimePayload["lines"] = order.lines.map((l) => ({ description: l.title, quantity: l.qty, unit_price: euros(l.unitPrice) }));
  if (order.totals.shipping > 0) lines.push({ description: `Livraison${order.delivery?.rateName ? ` — ${order.delivery.rateName}` : ""}`, quantity: 1, unit_price: euros(order.totals.shipping) });
  if (order.totals.discount > 0) lines.push({ description: "Remise", quantity: 1, unit_price: -euros(order.totals.discount) });

  const payload: TiimePayload = {
    order_id: order.id,
    customer: {
      firestore_id: order.customerUid ?? `guest-${order.id}`,
      ...(customer?.tiimeClientId !== undefined ? { tiime_client_id: customer.tiimeClientId } : {}),
      email: order.email,
      name: a.name,
      address: [a.line1, a.line2].filter(Boolean).join(", "),
      zip: a.postalCode,
      city: a.city,
      country: a.country,
      phone: a.phone ?? "",
    },
    lines,
    total: euros(order.totals.total),
  };
  if (!order.livemode) payload.test = true;
  return payload;
}
