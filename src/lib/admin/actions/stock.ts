"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { adjustInfluenceStock, adjustStock, setInfluenceStock } from "@/lib/db/products";

const Input = z.object({ slug: z.string().min(1), delta: z.number().int().min(-1000).max(1000) });
const SetInput = z.object({ slug: z.string().min(1), stock: z.number().int().min(0).max(100000) });

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

/*
 * Le stock mis de côté pour les partenaires et les jeux : réception d'un carton, casse,
 * correction. Les sorties ne passent jamais par là — un kit ou un lot commandé décompte
 * tout seul (voir `createGiftOrder`). La boutique n'en sait rien : pas de revalidation
 * du site, ces exemplaires ne sont pas à vendre.
 */
/*
 * Le nombre qu'on vient de compter sur l'étagère, posé tel quel. C'est la correction
 * ordinaire du stock influence : il ne baisse pas tout seul (ce qui est parti se lit sur
 * les commandes), donc le corriger, c'est dire combien il y en a — pas de combien il a
 * bougé.
 */
export async function setInfluenceStockAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(SetInput, formData, { numbers: ["stock"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const stock = await setInfluenceStock(parsed.data.slug, parsed.data.stock);
  await audit(user.email, "stock.influence.set", `products/${parsed.data.slug}`, `= ${stock}`);
  revalidatePath("/admin/stocks");
  return saved(`Stock influence : ${stock} mis de côté.`);
}

export async function adjustInfluenceStockAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["delta"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const stock = await adjustInfluenceStock(parsed.data.slug, parsed.data.delta);
  await audit(user.email, "stock.influence", `products/${parsed.data.slug}`, `${parsed.data.delta > 0 ? "+" : ""}${parsed.data.delta} → ${stock}`);
  revalidatePath("/admin/stocks");
  return saved(`Stock influence : ${stock}.`);
}
