"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteMedia, updateMediaAlt, uploadMedia } from "@/lib/db/media";

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
