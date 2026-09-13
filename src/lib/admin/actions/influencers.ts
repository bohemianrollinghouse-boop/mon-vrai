"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteInfluencer, getInfluencer, getInfluencerBySlug, issueInfluencerInvite, upsertInfluencer } from "@/lib/db/promos";
import { sendInfluencerWelcome } from "@/lib/email/send";
import { saveTemplateValues } from "@/lib/db/newsletter";
import { listStatements, markStatementPaid, unmarkStatement } from "@/lib/db/statements";
import { listOrders } from "@/lib/db/orders";
import { statementRows } from "@/lib/promos/statements";
import { now } from "@/lib/db/helpers";
import { PARTNER_WELCOME_ID } from "@/lib/newsletter/render";
import { slugify } from "@/lib/domain/slug";

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1, "Nom requis").max(80),
  slug: z.string().trim().max(40).default(""),
  rate: z.number().int().min(0).max(100).default(10),
  commission: z.boolean().default(false),
  email: z.string().trim().default(""),
  active: z.boolean().default(true),
  igHandle: z.string().trim().max(80).default(""),
  igUrl: z.string().trim().max(300).default(""),
  ttHandle: z.string().trim().max(80).default(""),
  ttUrl: z.string().trim().max(300).default(""),
  fbHandle: z.string().trim().max(80).default(""),
  fbUrl: z.string().trim().max(300).default(""),
});

export async function saveInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["rate"], booleans: ["active", "commission"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  /* À défaut d'identifiant de lien saisi, son nom fait l'affaire : le code promo, lui,
     n'est plus sur cette fiche — il appartient à ses campagnes. */
  const slug = slugify(d.slug || d.name);
  if (!slug) return failed("Identifiant de lien invalide.", { slug: "Invalide" });

  const existing = d.id ? await getInfluencer(d.id) : null;
  const bySlug = await getInfluencerBySlug(slug);
  if (bySlug && bySlug.id !== existing?.id) return failed(`Le lien « ${slug} » est déjà pris par ${bySlug.name}.`, { slug: "Déjà utilisé" });

  if (d.email && !z.email().safeParse(d.email).success) return failed("E-mail invalide.", { email: "Adresse invalide" });

  const saved_ = await upsertInfluencer({
    id: existing?.id,
    name: d.name,
    slug,
    rate: d.rate,
    commission: d.commission,
    email: d.email,
    active: d.active,
    socials: {
      instagram: { handle: d.igHandle, url: d.igUrl },
      tiktok: { handle: d.ttHandle, url: d.ttUrl },
      facebook: { handle: d.fbHandle, url: d.fbUrl },
    },
  });
  await audit(user.email, existing ? "influencer.update" : "influencer.create", `influencers/${saved_.id}`, saved_.name);
  revalidatePath("/admin/influenceurs");
  revalidatePath(`/admin/influenceurs/${saved_.id}`);
  return {
    ok: true,
    message: existing ? `${saved_.name} enregistré.` : `${saved_.name} créé — ouvrez-lui une campagne pour lui donner un code.`,
    redirectTo: existing ? `/admin/influenceurs/${saved_.id}` : `/admin/influenceurs/${saved_.id}?onglet=campagnes`,
  };
}

export async function toggleInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const inf = await getInfluencer(id);
  if (!inf) return failed("Influenceur introuvable");
  await upsertInfluencer({ ...inf, active: !inf.active });
  await audit(user.email, inf.active ? "influencer.pause" : "influencer.activate", `influencers/${id}`);
  revalidatePath("/admin/influenceurs");
  revalidatePath(`/admin/influenceurs/${id}`);
  return saved(inf.active ? `${inf.name} en pause : code et lien inactifs.` : `${inf.name} réactivé.`);
}

export async function deleteInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const inf = await getInfluencer(id);
  if (!inf) return failed("Influenceur introuvable");
  await deleteInfluencer(id);
  await audit(user.email, "influencer.delete", `influencers/${id}`, inf.name);
  revalidatePath("/admin/influenceurs");
  /*
   * Redirection côté serveur, et non `redirectTo` : une action serveur invalide la
   * route courante, qui est ici la fiche qu'on vient de supprimer — elle se rendait
   * en 404 avant que la redirection n'aboutisse. `redirect()` coupe court.
   */
  redirect("/admin/influenceurs");
}

/*
 * Ouvre une invitation et envoie l'e-mail de bienvenue. Relancer l'envoi réémet un
 * jeton : le précédent cesse aussitôt de fonctionner, pour qu'un lien égaré ne reste
 * pas exploitable.
 */
export async function sendInfluencerWelcomeAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return failed("Partenaire inconnu");

  const influencer = await getInfluencer(id);
  if (!influencer) return failed("Partenaire inconnu");
  if (!influencer.email) return failed("Renseignez son adresse e-mail avant d'envoyer l'invitation.", { email: "Adresse requise" });

  const invite = await issueInfluencerInvite(id);
  if (!invite) return failed("Partenaire inconnu");

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const url = `${site}/partenaire/activation?token=${invite.token}`;
  const result = await sendInfluencerWelcome(influencer.email, url);
  if (!result.ok && !result.skipped) return failed(`L'envoi a échoué : ${result.error ?? "erreur inconnue"}`);

  await audit(user.email, "influencer.invite", `influencers/${id}`, influencer.email);
  revalidatePath(`/admin/influenceurs/${id}`);
  return saved(result.skipped ? `Invitation créée (envoi désactivé sans clé Resend) : ${url}` : `Invitation envoyée à ${influencer.email}.`);
}

/*
 * Textes de l'e-mail d'invitation. Ils vivent au même endroit que ceux des newsletters
 * (le moteur de rendu est le même), mais se composent dans l'onglet Influenceurs : ce
 * n'est pas un envoi marketing et il n'a rien à faire dans la liste des newsletters.
 */
export async function savePartnerWelcomeAction(values: Record<string, string>): Promise<AdminResult> {
  const user = await assertAdmin();
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v !== "string") continue;
    // Pas de clé technique ni de valeur démesurée : ces textes partent par e-mail.
    if (k.startsWith("__") || k.length > 40) continue;
    clean[k] = v.slice(0, 2000);
  }
  await saveTemplateValues(PARTNER_WELCOME_ID, clean);
  await audit(user.email, "influencer.welcome-email", "content/newsletter", PARTNER_WELCOME_ID);
  revalidatePath("/admin/influenceurs");
  return saved("E-mail d'invitation enregistré.");
}

/*
 * Marque un mois comme versé. Les montants sont figés au moment du marquage : un
 * remboursement survenu plus tard ne doit pas réécrire un relevé déjà payé.
 */
export async function markStatementPaidAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const undo = String(formData.get("undo") ?? "") === "true";
  if (!id || !/^\d{4}-\d{2}$/.test(month)) return failed("Requête invalide");

  const influencer = await getInfluencer(id);
  if (!influencer) return failed("Partenaire inconnu");
  if (!influencer.commission) return failed("Ce partenaire n'est pas commissionné.");

  if (undo) {
    await unmarkStatement(id, month);
    await audit(user.email, "influencer.statement-unpaid", `influencers/${id}`, month);
    revalidatePath(`/admin/influenceurs/${id}`);
    return saved(`Relevé de ${month} remis en attente.`);
  }

  const [orders, stored] = await Promise.all([listOrders({ limit: 2000 }), listStatements(id)]);
  const row = statementRows(influencer, orders, stored, now()).find((r) => r.month === month);
  if (!row) return failed("Aucun relevé pour ce mois.");
  if (row.status === "current") return failed("Le mois en cours ne peut pas être versé : attendez sa fin.");

  await markStatementPaid(id, month, {
    orders: row.orders,
    revenue: row.revenue,
    commission: row.commission,
    rate: influencer.rate,
    // Les reprises portées par ce relevé sont absorbées : elles ne reviendront pas.
    clawedBack: row.clawbacks.map((c) => c.orderNumber),
  });
  await audit(user.email, "influencer.statement-paid", `influencers/${id}`, `${month} · ${row.commission} c`);
  revalidatePath(`/admin/influenceurs/${id}`);
  return saved(`Relevé de ${month} marqué comme versé.`);
}


/*
 * Note interne sur un partenaire. Elle ne sort jamais de l'admin : ni l'espace
 * partenaire ni aucun e-mail ne la lisent.
 */
export async function saveInfluencerNoteAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const influencer = await getInfluencer(id);
  if (!influencer) return failed("Partenaire inconnu");

  await upsertInfluencer({ ...influencer, note });
  await audit(user.email, "influencer.note", `influencers/${id}`);
  revalidatePath(`/admin/influenceurs/${id}`);
  return saved(note ? "Note enregistrée." : "Note effacée.");
}
