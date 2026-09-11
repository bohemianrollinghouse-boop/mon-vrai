"use server";

import { z } from "zod";
import { saveContactMessage } from "@/lib/db/content";
import { sendContactForward } from "@/lib/email/send";

/*
 * Demande d'un professionnel (crèche, assistante maternelle, librairie, PMI…).
 *
 * Elle atterrit dans la même boîte de réception que les messages de contact plutôt que
 * dans une collection à part : c'est là que l'équipe regarde, et un second endroit à
 * surveiller serait un endroit oublié. Les champs propres au formulaire pro sont
 * rassemblés dans le corps du message, préfixés pour rester lisibles.
 */

export type ProResult = { ok: true } | { ok: false; error: string };

const Input = z.object({
  kind: z.string().trim().max(60).default(""),
  structure: z.string().trim().min(1, "Le nom de votre structure est requis").max(120),
  city: z.string().trim().max(80).default(""),
  name: z.string().trim().min(1, "Votre nom est requis").max(120),
  email: z.email("Adresse e-mail invalide"),
  phone: z.string().trim().max(40).default(""),
  size: z.string().trim().max(80).default(""),
  interests: z.array(z.string().max(60)).max(5).default([]),
  body: z.string().trim().max(5000).default(""),
  // Champ invisible pour les humains : un robot qui le remplit se trahit.
  website: z.string().max(0).default(""),
});

export async function sendProRequest(formData: FormData): Promise<ProResult> {
  const parsed = Input.safeParse({
    kind: formData.get("kind") ?? "",
    structure: formData.get("structure") ?? "",
    city: formData.get("city") ?? "",
    name: formData.get("name") ?? "",
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: formData.get("phone") ?? "",
    size: formData.get("size") ?? "",
    interests: formData.getAll("interests").map(String),
    body: formData.get("body") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const d = parsed.data;
  const lines = [
    `Structure : ${d.structure}${d.city ? ` (${d.city})` : ""}`,
    d.kind ? `Type : ${d.kind}` : "",
    d.size ? `Taille : ${d.size}` : "",
    d.interests.length > 0 ? `Intérêts : ${d.interests.join(", ")}` : "",
    "",
    d.body || "(aucun détail donné)",
  ].filter((l) => l !== "");

  const message = {
    name: d.name,
    email: d.email,
    phone: d.phone,
    subject: `Professionnel · ${d.kind || "demande"}`,
    body: lines.join("\n"),
  };
  await saveContactMessage(message);
  await sendContactForward(message).catch((err) => console.warn("[pro] e-mail non envoyé :", err));
  return { ok: true };
}
