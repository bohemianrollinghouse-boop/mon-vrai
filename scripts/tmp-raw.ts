import { col } from "@/lib/db/helpers";
import { listOrders } from "@/lib/db/orders";

async function main() {
  const raw = await col("orders").get();
  const parsed = await listOrders({ limit: 500 });
  console.log("documents bruts :", raw.size, "· lus par listOrders :", parsed.length);
  const parsedIds = new Set(parsed.map((o) => o.id));
  for (const d of raw.docs) {
    const data = d.data() as Record<string, unknown>;
    const mark = parsedIds.has(d.id) ? " " : "✗";
    console.log(` ${mark} ${d.id}  ${String(data.number ?? "?").padEnd(14)} ${String(data.status ?? "?").padEnd(12)} createdAt=${data.createdAt ?? "ABSENT"}`);
  }
}
main();
