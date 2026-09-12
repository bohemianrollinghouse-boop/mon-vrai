import { ActionForm } from "@/components/admin/ActionForm";
import { Card, GridTable, PageHeader, Pill } from "@/components/admin/ui";
import { NewsletterComposer } from "@/components/admin/NewsletterComposer";
import { refreshNewsletterStatsAction } from "@/lib/admin/actions/newsletter";
import { listNewsletterSends } from "@/lib/db/newsletter-sends";
import { requireAdmin } from "@/lib/auth/session";
import { buyerEmailsByProduct, getAllTemplateValues, listSubscribers } from "@/lib/db/newsletter";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import { brandFromSettings } from "@/lib/email/newsletter";

export const dynamic = "force-dynamic";

/*
 * Newsletter : liste des inscrits, et un composeur par modèles riches (Lancement, Nouveau
 * livre, Nouveau produit, Nouvelle catégorie…). On édite les textes/images d'un modèle et
 * on l'envoie à l'audience choisie ; le gabarit est fixe.
 */
export default async function NewsletterPage() {
  const user = await requireAdmin();
  const [savedValues, subscribers, products, byProduct, settings, sends] = await Promise.all([
    getAllTemplateValues(),
    listSubscribers(),
    listPublishedProducts(),
    buyerEmailsByProduct(),
    getSettings(),
    listNewsletterSends().catch(() => []),
  ]);

  // Un historique par newsletter, du plus récent au plus ancien à l'intérieur de chacun.
  const byTemplate = new Map<string, typeof sends>();
  for (const send of sends) {
    const list = byTemplate.get(send.templateId) ?? [];
    list.push(send);
    byTemplate.set(send.templateId, list);
  }

  const subEmails = new Set(subscribers.map((s) => s.email));
  const buyers = new Set<string>();
  for (const set of byProduct.values()) for (const e of set) if (subEmails.has(e)) buyers.add(e);
  const counts = { all: subscribers.length, buyers: buyers.size };

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  // Même marque que les envois réels : l'aperçu montre exactement le pied de page qui partira.
  const brand = brandFromSettings(settings, base);

  return (
    <>
      <PageHeader title="Newsletter" subtitle={`${subscribers.length} inscrit${subscribers.length > 1 ? "s" : ""}`} />

      <NewsletterComposer saved={savedValues} products={products.map((p) => ({ slug: p.slug, title: p.title }))} adminEmail={user.email} counts={counts} brand={brand} base={base} />

      {[...byTemplate.entries()].map(([templateId, list]) => (
        <Card key={templateId} title={`Envois · ${list[0].templateLabel || templateId}`} className="mt-4" aside={<span className="text-[0.6875rem] font-semibold text-subtle">{list.length} envoi{list.length > 1 ? "s" : ""}</span>}>
          <GridTable
            columns="auto 1fr 90px 110px 90px 90px auto"
            head={["Date", "Audience", "Envoyés", "Reçus", "Rebonds", "Ouverts", ""]}
            empty="Aucun envoi."
            rows={list.map((send) => {
              const stats = send.stats;
              // Le taux se calcule sur ce que Resend a accepté, pas sur les adresses visées :
              // un lot refusé n'a jamais atteint le transporteur, il n'a rien à voir ici.
              const rate = stats && send.accepted > 0 ? Math.round((stats.delivered / send.accepted) * 100) : null;
              return {
                key: send.id,
                cells: [
                  <span key="d" className="whitespace-nowrap font-semibold">
                    {new Date(send.sentAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    <span className="ml-1.5 text-[0.6875rem] font-medium text-subtle">{new Date(send.sentAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </span>,
                  <span key="a" className="flex min-w-0 flex-col">
                    <span className="truncate">{send.audience}</span>
                    <span className="truncate text-[0.6875rem] text-subtle" title={send.subject}>{send.subject}</span>
                  </span>,
                  <span key="e" className="font-bold">
                    {send.accepted}
                    {send.failed > 0 && <span className="ml-1 text-[0.6875rem] font-semibold text-danger">+{send.failed} en échec</span>}
                  </span>,
                  <span key="r" className="flex flex-col">
                    {stats ? (
                      <>
                        <span className="font-extrabold">{stats.delivered}{rate !== null && <span className="ml-1 text-[0.6875rem] font-semibold text-subtle">{rate} %</span>}</span>
                        <span className="text-[0.6875rem] text-subtle">relevé le {new Date(send.statsAt ?? send.sentAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                      </>
                    ) : (
                      <span className="text-[0.6875rem] text-subtle" title={send.statsError}>{send.statsError ? "indisponible" : "pas encore relevé"}</span>
                    )}
                  </span>,
                  <span key="b" className={stats && stats.bounced > 0 ? "font-bold text-danger" : "text-muted"}>{stats ? stats.bounced : "—"}</span>,
                  <span key="o" className="text-muted">{stats ? stats.opened : "—"}</span>,
                  <ActionForm key="x" action={refreshNewsletterStatsAction} submitLabel="Actualiser" submitTone="ghost" className="!gap-0 [&>div:last-child]:contents [&_button]:!px-0 [&_button]:!py-0 [&_button]:!text-[0.6875rem]">
                    <input type="hidden" name="id" value={send.id} />
                  </ActionForm>,
                ],
              };
            })}
          />
          {list.some((s) => s.statsError) && (
            <p className="text-[0.6875rem] leading-relaxed text-subtle">{list.find((s) => s.statsError)?.statsError}</p>
          )}
        </Card>
      ))}

      <Card title={`Inscrits (${subscribers.length})`} className="mt-4">
        <GridTable
          columns="1.4fr 1fr auto auto"
          head={["E-mail", "Nom", "Origine", "Inscrit le"]}
          empty="Aucun inscrit pour l'instant."
          rows={subscribers.slice(0, 500).map((s) => ({
            key: s.email,
            cells: [
              <span key="e" className="truncate font-semibold">
                {s.email}
              </span>,
              <span key="n" className="text-muted">
                {s.name || "—"}
              </span>,
              <Pill key="o" tone={s.source === "compte" ? "ok" : "neutral"}>
                {s.source}
              </Pill>,
              <span key="d" className="text-subtle">
                {s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
              </span>,
            ],
          }))}
        />
      </Card>
    </>
  );
}
