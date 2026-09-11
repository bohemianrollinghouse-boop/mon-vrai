"use server";

import { revalidatePath } from "next/cache";
import { requireInfluencer } from "@/lib/auth/session";
import { getInfluencerByUid, upsertInfluencer } from "@/lib/db/promos";
import { isIban } from "@/lib/promos/statements";

/*
 * Actions que le partenaire exécute lui-même, depuis son espace. Le partenaire visé
 * n'est jamais lu dans le formulaire : il se déduit de la session. Sans quoi un
 * partenaire pourrait écrire les coordonnées bancaires d'un autre en changeant un
 * champ caché.
 */

export type PartnerResult = { ok: true; message: string } | { ok: false; error: string };

export async function savePartnerIbanAction(formData: FormData): Promise<PartnerResult> {
  const user = await requireInfluencer();
  const influencer = await getInfluencerByUid(user.uid);
  if (!influencer) return { ok: false, error: "Compte partenaire introuvable." };
  if (!influencer.commission) return { ok: false, error: "Aucun versement n'est prévu pour ce compte." };

  const raw = String(formData.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();
  if (raw && !isIban(raw)) return { ok: false, error: "Cet IBAN ne semble pas valide." };

  await upsertInfluencer({ ...influencer, iban: raw });
  revalidatePath("/partenaire");
  return { ok: true, message: raw ? "Coordonnées bancaires enregistrées." : "Coordonnées bancaires retirées." };
}
