/*
 * Reconstitue l'historique des envois de newsletter antérieurs à la fonctionnalité.
 *
 * Resend ne connaît pas la notion de campagne : il garde des e-mails, un par
 * destinataire. On les relit donc, on ne retient que ceux dont le sujet est celui d'une
 * newsletter (les transactionnels ont leurs propres sujets), et on les regroupe par
 * sujet et par heure — un envoi part en quelques secondes, jamais à cheval sur deux
 * heures. Chaque groupe devient un envoi, avec ses identifiants : les statistiques se
 * relèvent ensuite depuis l'admin comme pour un envoi normal.
 *
 * Sans risque par défaut : rien n'est écrit tant qu'on ne passe pas --apply.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.production.local \
 *     scripts/backfill-newsletter-sends.ts [--apply]
 */
import { listNewsletterSends, recordNewsletterSend } from "@/lib/db/newsletter-sends";
import { getAllTemplateValues } from "@/lib/db/newsletter";
import { NEWSLETTER_TEMPLATES } from "@/lib/newsletter/render";

const APPLY = process.argv.includes("--apply");
type Mail = { id?: string; subject?: string; created_at?: string; last_event?: string };

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY absente : impossible de relire les envois.");
  const { Resend } = await import("resend");
  const resend = new Resend(key);

  /* Un sujet identifie un modèle : celui enregistré dans l'admin d'abord (c'est lui qui
     est parti), le sujet par défaut du modèle ensuite. */
  const saved = await getAllTemplateValues();
  const bySubject = new Map<string, { id: string; label: string }>();
  for (const t of NEWSLETTER_TEMPLATES) {
    bySubject.set(t.subject.trim(), { id: t.id, label: t.label });
    const s = saved[t.id]?.subject?.trim();
    if (s) bySubject.set(s, { id: t.id, label: t.label });
  }

  const mails: Mail[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const { data, error } = await resend.emails.list(after ? { limit: 100, after } : { limit: 100 });
    if (error) throw new Error(`Resend : ${error.message}`);
    const batch = (data?.data ?? []) as Mail[];
    mails.push(...batch);
    if (!data?.has_more || batch.length === 0) break;
    after = batch[batch.length - 1]?.id;
    if (!after) break;
  }
  console.log(`${mails.length} e-mails relus chez Resend`);

  /* Groupe = même sujet, même heure. */
  const groups = new Map<string, { templateId: string; label: string; subject: string; ids: string[]; first: number }>();
  for (const m of mails) {
    const subject = (m.subject ?? "").trim();
    const match = bySubject.get(subject);
    if (!match || !m.id || !m.created_at) continue;
    const at = new Date(m.created_at).getTime();
    if (Number.isNaN(at)) continue;
    const key_ = `${match.id}|${subject}|${new Date(at).toISOString().slice(0, 13)}`;
    const g = groups.get(key_) ?? { templateId: match.id, label: match.label, subject, ids: [], first: at };
    g.ids.push(m.id);
    g.first = Math.min(g.first, at);
    groups.set(key_, g);
  }

  const existing = await listNewsletterSends(500);
  const known = new Set(existing.flatMap((s) => s.emailIds));

  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");
  let written = 0;
  for (const g of [...groups.values()].sort((a, b) => a.first - b.first)) {
    if (g.ids.some((id) => known.has(id))) {
      console.log(`= ${new Date(g.first).toISOString().slice(0, 16)}  ${g.label.padEnd(18)} déjà consigné`);
      continue;
    }
    console.log(`~ ${new Date(g.first).toISOString().slice(0, 16)}  ${g.label.padEnd(18)} ${g.ids.length} destinataire(s)`);
    if (!APPLY) continue;
    await recordNewsletterSend({
      templateId: g.templateId,
      templateLabel: g.label,
      subject: g.subject,
      audience: "reconstitué depuis Resend",
      recipients: g.ids.length,
      accepted: g.ids.length,
      failed: 0,
      emailIds: g.ids,
      by: "",
      sentAt: g.first,
    });
    written += 1;
  }
  console.log(APPLY ? `\n${written} envoi(s) consigné(s).` : "\nRien écrit. Relancer avec --apply.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
