import "server-only";
import { SiteSettings } from "@/lib/domain/types";
import { col, now, parseDoc } from "./helpers";

/*
 * Un seul document de réglages. Les valeurs par défaut viennent du schéma : un
 * site fraîchement installé a déjà un nom, un seuil de livraison et des pays.
 */

const ref = () => col("settings").doc("site");

export async function getSettings(): Promise<SiteSettings> {
  const existing = await parseDoc(SiteSettings, await ref().get());
  return existing ?? SiteSettings.parse({ updatedAt: 0 });
}

export type SettingsInput = Omit<SiteSettings, "updatedAt">;

export async function saveSettings(input: SettingsInput): Promise<SiteSettings> {
  const doc = SiteSettings.parse({ ...input, updatedAt: now() });
  await ref().set(doc);
  return doc;
}
