/* Ce que la bibliothèque accepte : les pièces arrivent en PDF neuf fois sur dix, en
   photo le reste du temps, parfois en tableur ou en archive. */
export const ALLOWED_DOC_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "application/zip",
  "application/x-zip-compressed",
]);

/*
 * Ce que l'extension dit quand le navigateur ne dit rien.
 *
 * Un navigateur n'est pas tenu d'annoncer un type : Windows livre régulièrement un
 * fichier avec `type` vide, et certains le rangent en `application/octet-stream`. Le
 * dépôt tombait alors sur « Type de fichier refusé : inconnu » pour un PDF parfaitement
 * ordinaire. L'entête fait foi quand il dit quelque chose d'utile ; l'extension tranche
 * quand il se tait — c'est déjà la règle des contenus de partenaires
 * (domain/deliverables.contentMime), et elle vaut ici pour la même raison.
 */
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  zip: "application/zip",
};

/** Le type réel d'une pièce : celui qu'on annonce, sinon celui que dit son nom. */
export function documentMime(filename: string, declared: string): string {
  if (ALLOWED_DOC_MIMES.has(declared)) return declared;
  return EXT_MIME[filename.toLowerCase().split(".").pop() ?? ""] ?? declared;
}
