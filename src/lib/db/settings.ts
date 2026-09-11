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

/*
 * Le kit partenaire n'a pas sa place dans le grand formulaire des réglages : il se
 * gère dans l'onglet Influenceurs. Facultatif ici, préservé à l'écriture.
 */
export type SettingsInput = Omit<SiteSettings, "updatedAt" | "partnerKit"> & { partnerKit?: SiteSettings["partnerKit"] };

export async function saveSettings(input: SettingsInput): Promise<SiteSettings> {
  const existing = await getSettings().catch(() => null);
  const doc = SiteSettings.parse({ ...input, partnerKit: input.partnerKit ?? existing?.partnerKit ?? [], updatedAt: now() });
  await ref().set(doc);
  return doc;
}
