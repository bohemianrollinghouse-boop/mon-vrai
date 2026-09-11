"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { deleteInfluencer, getInfluencer, getInfluencerBySlug, getPromo, issueInfluencerInvite, upsertInfluencer } from "@/lib/db/promos";
import { sendInfluencerWelcome } from "@/lib/email/send";
import { saveTemplateValues } from "@/lib/db/newsletter";
import { listStatements, markStatementPaid, unmarkStatement } from "@/lib/db/statements";
import { listOrders } from "@/lib/db/orders";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { statementRows } from "@/lib/promos/statements";
import { now } from "@/lib/db/helpers";
import { PARTNER_WELCOME_ID } from "@/lib/newsletter/render";
import { slugify } from "@/lib/domain/slug";
import { Platform } from "@/lib/domain/types";

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1, "Nom requis").max(80),
  handle: z.string().trim().max(80).default(""),
  platform: Platform.default("Instagram"),
  slug: z.string().trim().max(40).default(""),
  code: z.string().trim().min(2, "2 caractères minimum").max(24).regex(/^[A-Za-z0-9]+$/, "Lettres et chiffres uniquement"),
  discount: z.number().int().min(0).max(100).default(10),
  rate: z.number().int().min(0).max(100).default(10),
  commission: z.boolean().default(false),
  email: z.string().trim().default(""),
  endAt: z.string().trim().default(""),
  active: z.boolean().default(true),
});

export async function saveInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["discount", "rate"], booleans: ["active", "commission"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;
  const code = d.code.toUpperCase();
  const slug = slugify(d.slug || d.code);
  if (!slug) return failed("Identifiant de lien invalide.", { slug: "Invalide" });

  const existing = d.id ? await getInfluencer(d.id) : null;
  const bySlug = await getInfluencerBySlug(slug);
  if (bySlug && bySlug.id !== existing?.id) return failed(`Le lien « ${slug} » est déjà pris par ${bySlug.name}.`, { slug: "Déjà utilisé" });
  const promo = await getPromo(code);
  if (promo && promo.influencerId !== existing?.id) return failed(`Le code ${code} existe déjà${promo.influencerId ? " (autre influenceur)" : " (code promo interne)"}.`, { code: "Déjà utilisé" });
  const endAt = d.endAt ? new Date(`${d.endAt}T23:59:59`).getTime() : undefined;
  if (endAt !== undefined && Number.isNaN(endAt)) return failed("Date de fin invalide.", { endAt: "Date invalide" });

  if (d.email && !z.email().safeParse(d.email).success) return failed("E-mail invalide.", { email: "Adresse invalide" });

  const saved_ = await upsertInfluencer({
    id: existing?.id,
    name: d.name,
    handle: d.handle,
    platform: d.platform,
    slug,
    code,
    discount: d.discount,
    rate: d.rate,
    commission: d.commission,
    email: d.email,
    endAt,
    active: d.active,
  });
  await audit(user.email, existing ? "influencer.update" : "influencer.create", `influencers/${saved_.id}`, `${saved_.name} · ${code}`);
  revalidatePath("/admin/influenceurs");
  revalidatePath("/admin/codes-promo");
  return { ok: true, message: `${saved_.name} enregistré${existing ? "" : " · code " + code + " actif"}.`, redirectTo: `/admin/influenceurs?id=${saved_.id}` };
}

export async function toggleInfluencerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const inf = await getInfluencer(id);
  if (!inf) return failed("Influenceur introuvable");
  await upsertInfluencer({ ...inf, active: !inf.active });
  await audit(user.email, inf.active ? "influencer.pause" : "influencer.activate", `influencers/${id}`);
  revalidatePath("/admin/influenceurs");
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
  return { ok: true, message: `${inf.name} supprimé (les ventes passées restent attribuées).`, redirectTo: "/admin/influenceurs" };
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
  revalidatePath("/admin/influenceurs");
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
    revalidatePath("/admin/influenceurs");
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
  revalidatePath("/admin/influenceurs");
  return saved(`Relevé de ${month} marqué comme versé.`);
}


const KitInput = z.object({
  enabled: z.boolean().default(false),
  title: z.string().trim().max(80).default("Votre kit de bienvenue"),
  text: z.string().trim().max(400).default(""),
  /** Sélection sérialisée par l'éditeur : `slug:quantité`, séparés par des virgules. */
  lines: z.string().default(""),
});

/*
 * Sélection des livres du kit de bienvenue. La même pour tous les partenaires : ils
 * sont choisis en amont, pris sur un stock à part, et la commande qui en naît ne
 * décrémente aucun stock de vente.
 */
export async function savePartnerKitAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(KitInput, formData, { booleans: ["enabled"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const lines = d.lines
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [slug, qty] = part.split(":");
      return { slug: slug.trim(), qty: Math.min(20, Math.max(1, Number(qty) || 1)) };
    })
    .filter((l) => l.slug);
  if (d.enabled && lines.length === 0) return failed("Choisissez au moins un livre avant d'activer le kit.", { lines: "Sélection vide" });

  const settings = await getSettings();
  await saveSettings({ ...settings, welcomeKit: { enabled: d.enabled, title: d.title, text: d.text, lines } });
  await audit(user.email, "influencer.kit", "settings/site", `${lines.length} titre${lines.length > 1 ? "s" : ""}${d.enabled ? "" : " (inactif)"}`);
  revalidatePath("/admin/influenceurs");
  revalidatePath("/partenaire");
  return saved(d.enabled ? "Kit de bienvenue enregistré et proposé aux partenaires." : "Kit de bienvenue enregistré (non proposé).");
}
