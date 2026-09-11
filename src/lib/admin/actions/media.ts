"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult, type MediaUploadResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteMedia, updateMediaAlt, uploadMedia } from "@/lib/db/media";
import type { Media } from "@/lib/domain/types";

/*
 * Médiathèque. L'envoi passe par le serveur (uploadMedia contrôle type et taille) ;
 * la suppression retire le fichier et sa fiche. Une image encore utilisée par un
 * produit ou un contenu affichera un lien mort : l'interface prévient avant.
 */

export async function uploadMediaAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return failed("Choisissez au moins un fichier.");
  const alt = String(formData.get("alt") ?? "").trim();

  let count = 0;
  for (const file of files) {
    try {
      const m = await uploadMedia({ bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, filename: file.name, alt });
      await audit(user.email, "media.upload", `media/${m.id}`, file.name);
      count++;
    } catch (e) {
      return failed(`${file.name} : ${(e as Error).message}`);
    }
  }
  revalidatePath("/admin/medias");
  return saved(`${count} fichier${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""}.`);
}

/*
 * Envoi depuis un sélecteur d'image (éditeur de pages, champ de partage SEO) : même
 * contrôle que ci-dessus, mais on renvoie les fiches créées. Le sélecteur peut alors
 * les ajouter à sa grille et choisir la première sans quitter l'éditeur — c'était
 * auparavant un aller-retour par /admin/medias.
 *
 * On ne revalide que /admin/medias, jamais la page en cours d'édition : la rafraîchir
 * remonterait l'éditeur et ferait perdre les blocs non enregistrés. C'est aussi
 * pourquoi la nouvelle fiche revient dans la réponse plutôt que par un rechargement.
 */
export async function uploadMediaFilesAction(formData: FormData): Promise<MediaUploadResult> {
  const user = await assertAdmin();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Choisissez au moins un fichier." };

  const created: Media[] = [];
  for (const file of files) {
    try {
      const m = await uploadMedia({ bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, filename: file.name, alt: "" });
      await audit(user.email, "media.upload", `media/${m.id}`, file.name);
      created.push(m);
    } catch (e) {
      // Ce qui est déjà passé reste : on rend la main avec les fiches créées ET l'erreur,
      // pour que le sélecteur puisse choisir une image sans taire le fichier refusé.
      const error = `${file.name} : ${(e as Error).message}`;
      if (created.length === 0) return { ok: false, error };
      revalidatePath("/admin/medias");
      return { ok: true, media: created, error };
    }
  }
  revalidatePath("/admin/medias");
  return { ok: true, media: created };
}

export async function updateMediaAltAction(formData: FormData): Promise<AdminResult> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const alt = String(formData.get("alt") ?? "").trim();
  if (!id) return failed("Média inconnu");
  await updateMediaAlt(id, alt);
  revalidatePath("/admin/medias");
  return saved("Texte alternatif enregistré.");
}

export async function deleteMediaAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return failed("Média inconnu");
  await deleteMedia(id);
  await audit(user.email, "media.delete", `media/${id}`);
  revalidatePath("/admin/medias");
  return saved("Fichier supprimé.");
}
