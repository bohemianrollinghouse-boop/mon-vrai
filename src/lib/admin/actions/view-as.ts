"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/admin/audit";
import { assertAdmin, VIEW_AS_COOKIE, VIEW_AS_MINUTES } from "@/lib/auth/session";
import { getInfluencer } from "@/lib/db/promos";

/*
 * Regarder l'espace d'un partenaire avec ses yeux.
 *
 * C'est une VUE, pas une connexion : aucun jeton n'est émis, la session reste celle de
 * l'administrateur, et les actions de l'espace partenaire refusent de s'exécuter (voir
 * auth/partner-actions.ts). Rien ne peut donc être signé, commandé ni enregistré au nom
 * de quelqu'un d'autre — ce qui, pour un contrat, n'aurait aucune valeur.
 *
 * Le cookie tient une heure et se coupe d'un bouton : on ne laisse pas traîner un état
 * où l'administration regarde le site par-dessus l'épaule d'un tiers.
 */
export async function viewAsPartnerAction(formData: FormData): Promise<void> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const influencer = await getInfluencer(id);
  if (!influencer) redirect("/admin/influenceurs");

  (await cookies()).set(VIEW_AS_COOKIE, influencer.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIEW_AS_MINUTES * 60,
  });
  await audit(user.email, "influencer.view-as", `influencers/${influencer.id}`, influencer.name);
  redirect("/partenaire");
}

/** Quitte la vue et ramène là d'où l'on vient, sur la fiche du partenaire regardé. */
export async function stopViewAsAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const jar = await cookies();
  const id = jar.get(VIEW_AS_COOKIE)?.value ?? "";
  jar.delete(VIEW_AS_COOKIE);
  const back = String(formData.get("retour") ?? "");
  redirect(back || (id ? `/admin/influenceurs/${id}` : "/admin/influenceurs"));
}
