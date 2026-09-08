"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { adjustStock } from "@/lib/db/products";

const Input = z.object({ slug: z.string().min(1), delta: z.number().int().min(-1000).max(1000) });

/** Page Stocks : ±1 (ou une réception de N exemplaires) sur un titre suivi. */
export async function adjustStockAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["delta"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const { stock, startedTracking } = await adjustStock(parsed.data.slug, parsed.data.delta);
  await audit(user.email, "stock.adjust", `products/${parsed.data.slug}`, `${parsed.data.delta > 0 ? "+" : ""}${parsed.data.delta} → ${stock}`);
  revalidatePath("/admin/stocks");
  revalidatePath("/", "layout");
  return saved(startedTracking ? `Suivi du stock activé : ${stock} ex.` : `Stock : ${stock}.`);
}
