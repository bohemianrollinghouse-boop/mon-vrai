"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { newId, now } from "@/lib/db/helpers";
import { getIntegration, setConnection, setRules, setSettings, validToken } from "@/lib/db/instagram";
import { IgRule, IgSettings, decide, shadowedRules } from "@/lib/domain/instagram";
import { IG_STATE_COOKIE, authorizeUrl, instagramConfigured, instagramRedirectUri, subscribeWebhooks } from "@/lib/instagram/client";

/*
 * Les gestes de /admin/instagram. Comme ailleurs dans l'admin, une action par
 * formulaire : enregistrer des règles ne doit pas pouvoir éteindre l'interrupteur
 * général, ni déconnecter le compte.
 */

const boolish = z.union([z.boolean(), z.string()]).default(false).transform((v) => v === true || v === "true" || v === "on");

/* ---------- Connexion ---------- */

/*
 * Part vers l'écran de consentement Instagram. L'état est tiré au sort et déposé en
 * cookie : c'est lui qu'on relira au retour pour s'assurer que le code vient bien du
 * voyage qu'on a nous-même commencé.
 */
export async function connectInstagramAction(): Promise<void> {
  await assertAdmin();
  if (!instagramConfigured()) redirect("/admin/instagram?erreur=" + encodeURIComponent("Clés Instagram absentes du serveur."));

  const state = randomUUID();
  const jar = await cookies();
  jar.set(IG_STATE_COOKIE, state, {
    httpOnly: true,
    /* Instagram n'accepte qu'une adresse de retour en HTTPS : le cookie peut l'exiger aussi. */
    secure: true,
    /* « lax » et non « strict » : le retour depuis instagram.com est une navigation d'un autre site. */
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(authorizeUrl(instagramRedirectUri(), state));
}

/*
 * Déconnecte. On efface le jeton de chez nous ; l'autorisation reste côté Instagram
 * tant que la personne ne la retire pas dans ses réglages — le dire plutôt que de
 * laisser croire qu'on a tout révoqué.
 */
export async function disconnectInstagramAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  await setConnection(null);
  await audit(user.email, "instagram.disconnect", "integrations/instagram");
  revalidatePath("/admin/instagram");
  return saved("Compte déconnecté. L'autorisation reste à retirer dans les réglages Instagram si vous le souhaitez.");
}

/*
 * Réabonne le compte aux notifications. Séparé de la connexion parce que c'est l'étape
 * qui échoue seule, et qu'il serait absurde de redemander un consentement complet pour
 * rejouer un appel.
 */
export async function resubscribeAction(): Promise<AdminResult> {
  const user = await assertAdmin();
  const auth = await validToken();
  if (!auth) return failed("Aucun compte connecté, ou jeton expiré.");
  try {
    await subscribeWebhooks(auth.token);
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  }
  await audit(user.email, "instagram.subscribe", "integrations/instagram");
  revalidatePath("/admin/instagram");
  return saved("Compte réabonné aux commentaires et aux messages.");
}

/* ---------- Réglages ---------- */

const SettingsInput = z.object({
  enabled: boolish,
  dryRun: boolish,
  hourlyCap: z.number().int().min(1).max(500).default(60),
});

export async function saveIgSettingsAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(SettingsInput, formData, { booleans: ["enabled", "dryRun"], numbers: ["hourlyCap"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);

  const next = IgSettings.safeParse(parsed.data);
  if (!next.success) return failed(next.error.issues[0]?.message ?? "Réglages invalides");

  /* Allumer sans compte connecté ne produirait que des lignes de journal. */
  const { connection } = await getIntegration();
  if (next.data.enabled && !connection) return failed("Connectez d'abord un compte Instagram.");

  await setSettings(next.data);
  await audit(user.email, "instagram.settings", "integrations/instagram", `${next.data.enabled ? "actif" : "éteint"}${next.data.dryRun ? ", essai à blanc" : ""}`);
  revalidatePath("/admin/instagram");
  if (!next.data.enabled) return saved("Réponses automatiques éteintes.");
  return saved(next.data.dryRun ? "Actif en essai à blanc : rien n'est envoyé, tout est journalisé." : "Actif. Les réponses partent pour de vrai.");
}

/* ---------- Règles ---------- */

/*
 * Une règle se saisit en texte : les mots-clés séparés par des virgules, les
 * formulations une par ligne. C'est le formulaire le plus simple qui puisse rendre ce
 * service, et il marche sans JavaScript — comme le reste de l'admin.
 */
const RulesInput = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().trim().max(40).default(""),
        name: z.string().trim().max(80).default(""),
        on: z.enum(["comment", "message"]).default("comment"),
        enabled: boolish,
        keywords: z.string().max(600).default(""),
        /*
         * Les publications arrivent en cases cochées (`mediaIds[]`), donc en tableau —
         * et en chaîne quand une seule case l'est, ou quand la règle vient d'un
         * enregistrement d'avant le sélecteur. Les deux formes sont acceptées : c'est
         * le prix d'un formulaire HTML, pas une hésitation de conception.
         */
        mediaIds: z.union([z.string().max(2000), z.array(z.string().trim().max(60)).max(50)]).default([]),
        publicReplies: z.string().max(3000).default(""),
        privateReply: z.string().max(900).default(""),
      }),
    )
    .max(50)
    .default([]),
});

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const commas = (s: string) => s.split(/[\n,;]/).map((l) => l.trim()).filter(Boolean);

export async function saveIgRulesAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(RulesInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);

  const current = await getIntegration();
  const at = now();
  const previous = new Map(current.rules.map((r) => [r.id, r]));

  const built: IgRule[] = [];
  for (const row of parsed.data.rules) {
    const publicReplies = lines(row.publicReplies);
    const privateReply = row.privateReply.trim();
    /* Une ligne sans nom ni réponse est une ligne laissée vide : on l'ignore. */
    if (!row.name && publicReplies.length === 0 && !privateReply) continue;

    const id = row.id || newId("igr");
    const rule = IgRule.safeParse({
      id,
      name: row.name,
      on: row.on,
      enabled: row.enabled,
      keywords: commas(row.keywords),
      mediaIds: Array.isArray(row.mediaIds) ? row.mediaIds.filter(Boolean) : commas(row.mediaIds),
      /* Un message privé ne se répond pas « en public » : la colonne n'a pas de sens là. */
      publicReplies: row.on === "comment" ? publicReplies : [],
      privateReply,
      createdAt: previous.get(id)?.createdAt || at,
      updatedAt: at,
    });
    if (!rule.success) return failed(`Règle « ${row.name || id} » : ${rule.error.issues[0]?.message ?? "invalide"}`);
    if (rule.data.publicReplies.length === 0 && !rule.data.privateReply) {
      return failed(`La règle « ${rule.data.name || id} » n'a rien à répondre.`);
    }
    built.push(rule.data);
  }

  await setRules(built);
  await audit(user.email, "instagram.rules", "integrations/instagram", `${built.length} règle${built.length > 1 ? "s" : ""}`);
  revalidatePath("/admin/instagram");

  /*
   * L'avertissement plutôt que le refus : une règle attrape-tout est légitime, mais
   * celles qu'elle masque ne serviront jamais et personne ne doit l'apprendre par
   * l'absence de réponses.
   */
  const dead = shadowedRules(built);
  if (dead.length > 0) {
    const names = built.filter((r) => dead.includes(r.id)).map((r) => `« ${r.name || r.id} »`).join(", ");
    return saved(`${built.length} règle${built.length > 1 ? "s" : ""} enregistrée${built.length > 1 ? "s" : ""}. Attention : ${names} ne se déclenchera${dead.length > 1 ? "ont" : ""} jamais — une règle sans mot-clé placée au-dessus prend déjà tout.`);
  }
  return saved(`${built.length} règle${built.length > 1 ? "s" : ""} enregistrée${built.length > 1 ? "s" : ""}.`);
}

/* ---------- Essayer ---------- */

const TestInput = z.object({
  kind: z.enum(["comment", "message"]).default("comment"),
  text: z.string().trim().max(500).default(""),
});

/*
 * « Si quelqu'un écrivait ceci, que ferait-on ? »
 *
 * Tout se décide dans `decide()`, qui est pur : l'essai emprunte donc exactement le
 * chemin du vrai, sans rien simuler ni rien envoyer. C'est la seule façon qu'une
 * réponse d'essai soit la preuve de quelque chose.
 */
export async function testIgRuleAction(formData: FormData): Promise<AdminResult> {
  await assertAdmin();
  const parsed = parseForm(TestInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  if (!parsed.data.text) return failed("Écrivez la phrase à essayer.");

  const { connection, settings, rules } = await getIntegration();
  const decision = decide({
    incoming: { kind: parsed.data.kind, text: parsed.data.text, mediaId: "" },
    fromId: "essai",
    igUserId: connection?.igUserId ?? "",
    sourceId: `essai-${parsed.data.text}`,
    rules,
    /* L'interrupteur et le plafond sont écartés : on essaie les RÈGLES, pas l'état du jour. */
    settings: { ...settings, enabled: true },
    sentThisHour: 0,
  });

  if (!decision.act) return failed(`Rien ne partirait — ${decision.reason.toLowerCase()}.`);
  const parts = [
    decision.publicReply ? `en public : « ${decision.publicReply} »` : "",
    decision.privateReply ? `en privé : « ${decision.privateReply} »` : "",
  ].filter(Boolean);
  return saved(`Règle « ${decision.rule.name || decision.rule.id} » — ${parts.join(" ; ")}`);
}
