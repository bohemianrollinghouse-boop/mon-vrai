import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, Pill } from "@/components/admin/ui";
import { toggleMessageReadAction } from "@/lib/admin/actions/messages";
import { listContactMessages } from "@/lib/db/content";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const messages = await listContactMessages(200);
  const unread = messages.filter((m) => !m.read).length;

  return (
    <>
      <PageHeader title="Messages" subtitle={`${messages.length} reçus · ${unread} non lus. Répondez depuis votre boîte e-mail : le lien ouvre une réponse pré-remplie.`} />
      {messages.length === 0 ? (
        <p className="rounded-card bg-white p-6 text-sm text-muted">Aucun message pour l'instant.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className={`flex flex-col gap-3 rounded-card bg-white p-5 ${m.read ? "opacity-75" : "border-l-4 border-ink"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{m.name || m.email}</span>
                    {m.subject && <Pill>{m.subject}</Pill>}
                    {!m.read && <Pill tone="warn">Nouveau</Pill>}
                  </div>
                  <span className="text-xs text-subtle">
                    {new Date(m.createdAt).toLocaleString("fr-FR")} · {m.email}
                    {m.phone && ` · ${m.phone}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re : ${m.subject || "votre message"} - Mon Vrai`)}`}
                    className="rounded-pill bg-ink px-3.5 py-2 text-xs font-bold text-white"
                  >
                    Répondre
                  </a>
                  <ActionForm action={toggleMessageReadAction} submitLabel={m.read ? "Marquer non lu" : "Marquer lu"} className="gap-0 [&>div]:border-0 [&>div]:pt-0 [&_button]:bg-paper [&_button]:text-ink">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="read" value={m.read ? "false" : "true"} />
                  </ActionForm>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
