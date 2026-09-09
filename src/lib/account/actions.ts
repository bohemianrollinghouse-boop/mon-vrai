"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { destroySession, requireUser } from "@/lib/auth/session";
import { col, now } from "@/lib/db/helpers";
import { eraseCustomer, getCustomer, updateCustomer } from "@/lib/db/customers";
import { adminAuth } from "@/lib/firebase/admin";
import { Address } from "@/lib/domain/types";
import { parseForm } from "@/lib/admin/form";

/*
 * Espace client : ce que la personne connectée peut faire elle-même - ses adresses, son
 * nom, sa newsletter, la suppression de son compte. Toujours sur son propre uid, jamais
 * un identifiant venu du formulaire.
 */

export type AccountResult = { ok: true; message: string } | { ok: false; error: string; issues?: Record<string, string> };
const fail = (error: string, issues?: Record<string, string>): AccountResult => ({ ok: false, error, issues });

const Profile = z.object({ firstName: z.string().trim().min(1, "Prénom requis").max(60), lastName: z.string().trim().max(60).default(""), phone: z.string().trim().max(30).default("") });

export async function updateProfileAction(formData: FormData): Promise<AccountResult> {
  const user = await requireUser();
  const parsed = parseForm(Profile, formData);
  if (!parsed.ok) return fail(parsed.error, parsed.issues);
  const name = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();
  await Promise.all([updateCustomer(user.uid, { name }), adminAuth().updateUser(user.uid, { displayName: name })]);
  revalidatePath("/compte");
  return { ok: true, message: "Informations enregistrées. Elles apparaîtront à votre prochaine connexion." };
}

const AddressInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  line1: z.string().trim().min(3, "Adresse requise").max(120),
  line2: z.string().trim().max(120).default(""),
  postalCode: z.string().trim().min(4, "Code postal requis").max(10),
  city: z.string().trim().min(1, "Ville requise").max(80),
  country: z.string().trim().length(2).default("FR"),
  phone: z.string().trim().max(30).default(""),
});

export async function addAddressAction(formData: FormData): Promise<AccountResult> {
  const user = await requireUser();
  const parsed = parseForm(AddressInput, formData);
  if (!parsed.ok) return fail(parsed.error, parsed.issues);
  const d = parsed.data;
  const address = Address.parse({ ...d, line2: d.line2 || undefined, phone: d.phone || undefined, country: d.country.toUpperCase() });
  const c = await getCustomer(user.uid);
  if (!c) return fail("Compte introuvable");
  if (c.addresses.length >= 5) return fail("Cinq adresses maximum : supprimez-en une d'abord.");
  await updateCustomer(user.uid, { addresses: [...c.addresses, address] });
  revalidatePath("/compte");
  return { ok: true, message: "Adresse ajoutée." };
}

export async function deleteAddressAction(formData: FormData): Promise<AccountResult> {
  const user = await requireUser();
  const index = Number(formData.get("index"));
  const c = await getCustomer(user.uid);
  if (!c || !Number.isInteger(index) || index < 0 || index >= c.addresses.length) return fail("Adresse introuvable");
  await updateCustomer(user.uid, { addresses: c.addresses.filter((_, i) => i !== index) });
  revalidatePath("/compte");
  return { ok: true, message: "Adresse supprimée." };
}

export async function setNewsletterAction(formData: FormData): Promise<AccountResult> {
  const user = await requireUser();
  const optIn = formData.get("optIn") === "on" || formData.get("optIn") === "true";
  const at = now();
  await Promise.all([
    updateCustomer(user.uid, { newsletter: { optIn, at } }),
    col("newsletter").doc(encodeURIComponent(user.email.toLowerCase())).set({ email: user.email.toLowerCase(), source: "compte", optIn, [optIn ? "subscribedAt" : "unsubscribedAt"]: at }, { merge: true }),
  ]);
  revalidatePath("/compte");
  return { ok: true, message: optIn ? "Vous êtes inscrit·e à la newsletter." : "Vous êtes désinscrit·e." };
}

/** Suppression RGPD : fiche client et compte Auth ; les commandes restent, détachées. */
export async function deleteAccountAction(formData: FormData): Promise<AccountResult> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "SUPPRIMER") return fail("Tapez SUPPRIMER pour confirmer.");
  await eraseCustomer(user.uid).catch(() => undefined);
  await adminAuth().deleteUser(user.uid);
  await destroySession();
  return { ok: true, message: "Compte supprimé." };
}
