"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { saveFooterMenu, saveHeaderMenu } from "@/lib/db/menus";
import { FooterColumn, MenuItem } from "@/lib/domain/types";

/*
 * Menus. L'éditeur (client) manipule la structure et l'envoie en JSON dans un champ
 * caché ; ici on valide avec les schémas du domaine - un lien vers une page système
 * inconnue ou une URL vide est refusé avant d'atteindre la base.
 */

export async function saveHeaderMenuAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = z.array(MenuItem).max(8).safeParse(readJson(formData.get("items")));
  if (!parsed.success) return failed(`Menu invalide : ${parsed.error.issues[0]?.message ?? ""}`);
  await saveHeaderMenu(parsed.data);
  await audit(user.email, "menu.header.save", "menus/header", `${parsed.data.length} entrées`);
  revalidatePath("/", "layout");
  return saved("Menu d'en-tête enregistré.");
}

export async function saveFooterMenuAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = z.array(FooterColumn).max(3).safeParse(readJson(formData.get("columns")));
  if (!parsed.success) return failed(`Menu invalide : ${parsed.error.issues[0]?.message ?? ""}`);
  await saveFooterMenu(parsed.data);
  await audit(user.email, "menu.footer.save", "menus/footer", `${parsed.data.length} colonnes`);
  revalidatePath("/", "layout");
  return saved("Menu de pied de page enregistré.");
}

function readJson(v: FormDataEntryValue | null): unknown {
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
