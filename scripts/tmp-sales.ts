import { listOrders } from "@/lib/db/orders";
import { getSettings } from "@/lib/db/settings";

async function main() {
  const [orders, settings] = await Promise.all([listOrders({ limit: 200 }), getSettings()]);
  console.log("mode paiement :", settings.payments.mode, "· Boxtal :", settings.shipping.boxtalMode);
  console.log("commandes en base :", orders.length);
  for (const o of orders.slice(0, 12)) {
    console.log(" ", new Date(o.createdAt).toISOString().slice(0, 16), o.number.padEnd(14), o.status.padEnd(12), String(o.totals.total).padStart(6), o.livemode ? "live" : "TEST", o.kit ? "kit" : "");
  }
}
main();
