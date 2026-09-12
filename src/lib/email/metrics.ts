import "server-only";
import type { NewsletterSendStats } from "@/lib/domain/types";

/*
 * Ce que Resend sait devenu d'un envoi. Resend n'a pas de notion de campagne pour nous :
 * il connaît des e-mails, un par destinataire. On lui demande donc les totaux pour les
 * identifiants créés à l'envoi (`emails.metrics`, filtré par `emailId`).
 *
 * Deux limites assumées :
 *  - une clé d'API restreinte à l'envoi ne peut pas lire ces chiffres. On le dit
 *    clairement plutôt que d'afficher des zéros trompeurs ;
 *  - la fenêtre par défaut de l'API est courte : on la cale sur la date d'envoi.
 *
 * La clé de lecture peut être distincte de celle d'envoi (`RESEND_METRICS_API_KEY`),
 * pour que le chemin qui envoie ne porte pas aussi le droit de tout lire ; à défaut on
 * reprend la clé d'envoi, qui doit alors être en accès complet.
 */

const CHUNK = 100;

export type StatsOutcome = { ok: true; stats: NewsletterSendStats } | { ok: false; error: string };

export async function fetchSendStats(emailIds: string[], sentAt: number): Promise<StatsOutcome> {
  const key = process.env.RESEND_METRICS_API_KEY || process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Clé Resend absente." };
  if (emailIds.length === 0) return { ok: false, error: "Aucun e-mail à relire pour cet envoi." };

  const { Resend } = await import("resend");
  const resend = new Resend(key);
  // Une journée de marge de part et d'autre : accusés et ouvertures arrivent après coup.
  const startDate = new Date(sentAt - 86_400_000).toISOString();
  const endDate = new Date(Date.now() + 86_400_000).toISOString();

  const total: NewsletterSendStats = { delivered: 0, bounced: 0, complained: 0, opened: 0, clicked: 0 };

  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const { data, error } = await resend.emails.metrics({
      emailId: emailIds.slice(i, i + CHUNK),
      startDate,
      endDate,
      metrics: ["delivered", "bounced", "complained", "opened", "clicked"],
    });
    if (error) {
      const restricted = error.name === "restricted_api_key";
      return {
        ok: false,
        error: restricted
          ? "La clé Resend n'autorise que l'envoi. Créez-en une en accès complet dans Resend et posez-la dans RESEND_METRICS_API_KEY pour lire les statistiques."
          : `Resend : ${error.message}`,
      };
    }
    const t = data?.totals ?? {};
    total.delivered += t.delivered ?? 0;
    total.bounced += t.bounced ?? 0;
    total.complained += t.complained ?? 0;
    total.opened += t.opened ?? 0;
    total.clicked += t.clicked ?? 0;
  }

  return { ok: true, stats: total };
}
