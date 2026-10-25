"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { listAllDeliverables, setDeliverableMedia } from "@/lib/db/deliverables";
import { copyIntoMedia } from "@/lib/db/media";
import { getInfluencersByIds } from "@/lib/db/promos";

/*
 * Rapatrie dans la médiathèque les contenus de campagne déposés AVANT que le versement
 * ne devienne automatique.
 *
 * La règle est désormais simple — tout média importé dans l'administration se retrouve
 * dans Médias —, mais une règle ne vaut rien si elle ne s'applique qu'à l'avenir : les
 * fichiers déjà reçus resteraient introuvables, et il faudrait se souvenir de la date du
 * changement pour savoir où chercher. D'où ce bouton, qui met le passé au niveau du
 * présent.
 *
 * Deux précautions. Il est IDEMPOTENT : un contenu qui porte déjà son `mediaId` est
 * sauté, et on peut cliquer dix fois sans faire un seul doublon. Et il travaille PAR
 * LOTS : une action serveur ne tient pas trois cents copies de vidéos dans le temps
 * qu'on lui laisse, et un rapatriement à moitié fait qui échoue en bloc n'aurait rien
 * rapatrié du tout. Chaque lot compte, le bouton dit ce qu'il reste, on reclique.
 */

/** Ce qu'un clic traite. Assez pour avancer vite, assez peu pour finir à coup sûr. */
const BATCH = 25;

export async function backfillDeliverableMediaAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  const all = await listAllDeliverables();
  const pending = all.filter((d) => !d.mediaId);
  if (pending.length === 0) return saved("Tous les contenus de campagne sont déjà dans Médias.");

  const batch = pending.slice(0, BATCH);
  const owners = await getInfluencersByIds([...new Set(batch.map((d) => d.influencerId))]).catch(() => new Map());

  let done = 0;
  const refused: string[] = [];
  for (const doc of batch) {
    try {
      const copy = await copyIntoMedia({
        path: doc.path,
        mime: doc.mime,
        filename: doc.filename,
        folder: owners.get(doc.influencerId)?.name ?? "",
      });
      await setDeliverableMedia(doc.id, copy.id);
      done += 1;
    } catch {
      /* Un format que la médiathèque n'affiche pas (HEIC, MOV), ou un objet disparu du
         coffre. On le nomme plutôt que de le taire : c'est ce qu'il faudra convertir. */
      refused.push(doc.filename);
    }
  }

  const left = pending.length - done - refused.length;
  await audit(user.email, "media.backfill", "media", `${done} versé(s), ${refused.length} refusé(s)`);
  revalidatePath("/admin/medias");

  const parts = [`${done} contenu${done > 1 ? "s" : ""} versé${done > 1 ? "s" : ""} dans Médias`];
  if (refused.length > 0) parts.push(`${refused.length} refusé${refused.length > 1 ? "s" : ""} (format non affichable : ${refused.slice(0, 3).join(", ")}${refused.length > 3 ? "…" : ""})`);
  if (left > 0) parts.push(`il en reste ${left} — recliquez pour continuer`);
  return saved(`${parts.join(" · ")}.`);
}
