"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { listMedia } from "@/lib/db/media";
import { INSPIRATION_SLOTS, SCENE_SLOTS, VIDEO_SLOTS } from "@/lib/guide/content";
import { GuideSettings, type GuideShot, type GuideVideo } from "@/lib/domain/types";

/*
 * Les exemples du guide de création de contenu.
 *
 * Rien n'est cru du formulaire. Les EMPLACEMENTS viennent du texte du guide et non des
 * champs postés : une clé inventée ne désigne aucune place et ne s'écrit nulle part.
 * Les FICHIERS sont relus dans la médiathèque : une adresse qui n'y correspond à rien
 * est écartée, pour qu'on ne puisse pas faire pointer le guide vers n'importe où.
 *
 * Cette action ne touche QUE `settings.guide` : elle relit les réglages et réécrit cette
 * seule branche, comme le font /admin/reglages et /admin/livraison — sans quoi l'une
 * remettrait l'autre à ses valeurs par défaut.
 */
export async function saveGuideAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const current = await getSettings();

  /* La médiathèque fait foi : on ne garde que ce qui s'y trouve encore. */
  const known = new Set((await listMedia(300)).map((m) => m.url));
  const url = (value: FormDataEntryValue | null) => {
    const raw = String(value ?? "").trim();
    return raw && known.has(raw) ? raw : "";
  };

  const shots = (prefix: string, slots: { key: string }[]): GuideShot[] =>
    slots.map((slot) => ({ key: slot.key, url: url(formData.get(`${prefix}.${slot.key}`)) })).filter((s) => s.url);

  const videos: GuideVideo[] = VIDEO_SLOTS.map((slot) => ({
    key: slot.key,
    url: url(formData.get(`videos.${slot.key}.url`)),
    poster: url(formData.get(`videos.${slot.key}.poster`)),
  })).filter((v) => v.url || v.poster);

  const seconds = Number.parseInt(String(formData.get("rushSeconds") ?? ""), 10);
  const policy = String(formData.get("childPolicy") ?? "");

  const guide = GuideSettings.parse({
    rushSeconds: Number.isFinite(seconds) ? Math.min(60, Math.max(5, seconds)) : current.guide.rushSeconds,
    childPolicy: policy === "noFace" || policy === "face" ? policy : "choice",
    hero: url(formData.get("hero")),
    inspirations: shots("inspirations", INSPIRATION_SLOTS),
    scenes: shots("scenes", SCENE_SLOTS),
    videos,
  });

  await saveSettings({ ...current, guide });
  await audit(user.email, "settings.guide", "settings", `${videos.filter((v) => v.url).length} vidéo(s)`);
  revalidatePath("/admin/guide");
  revalidatePath("/guide-contenu");
  return saved("Guide enregistré.");
}
