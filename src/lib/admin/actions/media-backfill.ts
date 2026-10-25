"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { assertAdmin } from "@/lib/auth/session";
import { listAllDeliverables, setDeliverableMedia } from "@/lib/db/deliverables";
import { copyIntoMedia } from "@/lib/db/media";
import { getInfluencersByIds } from "@/lib/db/promos";

/*
 * Rapatrie dans la médiathèque les contenus de campagne déposés AVANT que le versement
 * ne devienne automatique.
 *
 * La règle est simple — tout média importé dans l'administration se retrouve dans
 * Médias —, mais une règle ne vaut rien si elle ne s'applique qu'à l'avenir : les
 * fichiers déjà reçus resteraient introuvables, et il faudrait se souvenir de la date du
 * changement pour savoir où chercher. Le rattrapage n'est pas un geste à faire, c'est
 * une dette à solder : l'écran des médias le fait tourner tout seul en s'ouvrant (voir
 * components/admin/MediaBackfill), et il n'y a rien à cliquer.
 *
 * Deux précautions. Il est IDEMPOTENT : un contenu qui porte déjà son `mediaId` est
 * sauté, et on peut le relancer dix fois sans faire un seul doublon. Et il travaille PAR
 * LOTS : une action serveur ne tient pas trois cents copies de vidéos dans le temps
 * qu'on lui laisse, et un rapatriement à moitié fait qui échouerait en bloc n'aurait
 * rien rapatrié du tout. Chaque lot compte ; l'appelant rappelle tant qu'il reste.
 *
 * Il rend des NOMBRES et non une phrase : c'est un appelant automatique qui le pilote,
 * et relire sa propre prose pour savoir s'il faut continuer serait un piège.
 */

/** Ce qu'un tour traite. Assez pour avancer vite, assez peu pour finir à coup sûr. */
const BATCH = 25;

export type BackfillRound = {
  done: number;
  /** Formats que la médiathèque n'affiche pas (HEIC, MOV) : ils ne passeront jamais. */
  refused: string[];
  /** Ce qu'il reste à prendre après ce tour. Zéro : la dette est soldée. */
  left: number;
  error?: string;
};

export async function runMediaBackfillAction(): Promise<BackfillRound> {
  const user = await assertAdmin();
  try {
    const all = await listAllDeliverables();
    const pending = all.filter((d) => !d.mediaId);
    if (pending.length === 0) return { done: 0, refused: [], left: 0 };

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
        /* Un format non affichable, ou un objet disparu du coffre. On le nomme plutôt
           que de le taire : c'est ce qu'il faudra convertir, et il ne repassera plus. */
        refused.push(doc.filename);
      }
    }

    if (done > 0) {
      await audit(user.email, "media.backfill", "media", `${done} versé(s)`);
      revalidatePath("/admin/medias");
    }
    /* Ce qui a été refusé reste « en attente » en base : on le retranche quand même du
       reste, sans quoi l'appelant tournerait indéfiniment sur les mêmes fichiers. */
    return { done, refused, left: Math.max(0, pending.length - done - refused.length) };
  } catch (e) {
    return { done: 0, refused: [], left: 0, error: (e as Error).message };
  }
}
