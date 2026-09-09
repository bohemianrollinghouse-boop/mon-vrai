"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { assertAdmin } from "@/lib/auth/session";
import { ADMIN_THEME_COOKIE, ADMIN_THEMES, type AdminTheme } from "@/lib/admin/theme";

/** Choix du thème de l'administration. Simple préférence d'affichage : rien à journaliser. */
export async function setAdminThemeAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const raw = String(formData.get("theme") ?? "");
  const theme: AdminTheme = ADMIN_THEMES.includes(raw as AdminTheme) ? (raw as AdminTheme) : "auto";
  (await cookies()).set(ADMIN_THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 400 * 24 * 60 * 60,
  });
  revalidatePath("/admin", "layout");
}
