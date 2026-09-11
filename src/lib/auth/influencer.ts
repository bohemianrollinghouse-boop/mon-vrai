"use server";

import { z } from "zod";
import { activateInfluencer, getInfluencerByInvite } from "@/lib/db/promos";
import { adminAuth } from "@/lib/firebase/admin";
import { setInfluencerClaim } from "@/lib/auth/session";

/*
 * Activation d'un espace partenaire. Le lien reçu par e-mail porte un jeton à usage
 * unique ; en choisissant son mot de passe, le partenaire obtient un compte Firebase
 * Auth ordinaire — le même que celui d'un client — avec un rôle en plus.
 *
 * L'adresse est marquée vérifiée sans second envoi : le partenaire a prouvé qu'il
 * relevait cette boîte en ouvrant le lien qui y avait été adressé. Lui redemander une
 * confirmation serait une formalité vide.
 */

export type ActivationResult = { ok: true; email: string } | { ok: false; error: string };

const Input = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "8 caractères minimum").max(200),
});

export async function activateInfluencerAccount(formData: FormData): Promise<ActivationResult> {
  const parsed = Input.safeParse({ token: String(formData.get("token") ?? ""), password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Mot de passe trop court" };

  const influencer = await getInfluencerByInvite(parsed.data.token);
  if (!influencer) return { ok: false, error: "Ce lien n'est plus valable. Demandez-en un nouveau." };
  if (!influencer.email) return { ok: false, error: "Aucune adresse n'est associée à ce partenaire." };

  const auth = adminAuth();
  // Le partenaire peut déjà avoir un compte client : on le réutilise plutôt que d'en
  // créer un second sur la même adresse, ce que Firebase refuserait de toute façon.
  const existing = await auth.getUserByEmail(influencer.email).catch(() => null);
  const user = existing
    ? await auth.updateUser(existing.uid, { password: parsed.data.password, emailVerified: true })
    : await auth.createUser({ email: influencer.email, password: parsed.data.password, displayName: influencer.name, emailVerified: true });

  await setInfluencerClaim(user.uid, influencer.id);
  await activateInfluencer(influencer.id, user.uid);
  return { ok: true, email: influencer.email };
}
