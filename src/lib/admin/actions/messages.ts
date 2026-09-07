"use server";

import { revalidatePath } from "next/cache";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { markMessageRead } from "@/lib/db/content";

/** Boîte de réception du formulaire de contact : marquer lu / non lu. */
export async function toggleMessageReadAction(formData: FormData): Promise<AdminResult> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const read = formData.get("read") === "true";
  if (!id) return failed("Message inconnu");
  await markMessageRead(id, read);
  revalidatePath("/admin/messages");
  return saved(read ? "Marqué comme lu." : "Marqué comme non lu.");
}
