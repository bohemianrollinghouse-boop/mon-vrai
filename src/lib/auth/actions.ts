"use server";

import { redirect } from "next/navigation";
import { destroySession } from "./session";

/** Déconnexion : le cookie de session disparaît, retour à l'accueil. */
export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
