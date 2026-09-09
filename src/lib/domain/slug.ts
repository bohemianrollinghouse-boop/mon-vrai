/*
 * Slugs d'URL et découpage des titres hérités de Shopify.
 */

/** « Les Animaux de la forêt » → « les-animaux-de-la-foret ». */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[’']/g, "-") // apostrophes → tiret, pour « l'oie » → « l-oie »
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Les titres Shopify étaient de la forme « 6-18 mois : Le Visage ». On sépare le
 * surtitre du nom ; sans « : », tout est le nom et le surtitre est vide.
 */
export function splitLegacyTitle(title: string): { ageLabel: string; name: string } {
  const idx = title.indexOf(" : ");
  if (idx === -1) return { ageLabel: "", name: title.trim() };
  return {
    ageLabel: title.slice(0, idx).trim().replace("6-18", "6-18"),
    name: title.slice(idx + 3).trim(),
  };
}

/**
 * Extrait la liste des six objets depuis la description Shopify :
 * « … pour découvrir les fruits du quotidien : la pomme, la clémentine et le kiwi. … »
 * → ["la pomme", "la clémentine", "le kiwi"]. Vide si la forme n'est pas reconnue.
 */
export function extractItems(descriptionHtml: string): string[] {
  const text = descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const idx = text.indexOf(" : ");
  if (idx === -1) return [];
  const segment = text.slice(idx + 3).split(".")[0] ?? "";
  if (!segment.trim()) return [];
  return segment
    .split(/,\s*|\s+et\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
