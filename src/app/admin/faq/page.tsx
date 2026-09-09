import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoSubmitSwitch } from "@/components/admin/AutoSubmitSwitch";
import { ButtonLink, Card, Field, PageHeader, Pill, Select, Switch, Textarea, type PillTone } from "@/components/admin/ui";
import { deleteFaqItemAction, moveFaqItemAction, saveFaqItemAction, toggleFaqItemAction } from "@/lib/admin/actions/faq";
import { getContactContent } from "@/lib/db/content";

export const dynamic = "force-dynamic";

/*
 * FAQ, d'après la maquette : la liste à gauche (rubrique, question, début de réponse,
 * interrupteur visible/masquée), l'éditeur collant à droite. `?q=<index>` sélectionne
 * une question ; `?q=nouvelle` ouvre un formulaire vide.
 */

const CATEGORIES = ["Précommande", "Livraison", "Retours", "Les livres"];
const CAT_TONE: Record<string, PillTone> = { Précommande: "ok", Livraison: "blue", Retours: "pink", "Les livres": "warn" };

export default async function FaqPage({ searchParams }: PageProps<"/admin/faq">) {
  const { q } = await searchParams;
  const content = await getContactContent();
  const items = content?.faq.items ?? [];
  const isNew = q === "nouvelle";
  const selected = !isNew && typeof q === "string" && /^\d+$/.test(q) ? Math.min(Number(q), items.length - 1) : items.length ? 0 : -1;
  const current = selected >= 0 ? items[selected] : null;
  const visible = items.filter((f) => !f.hidden).length;

  return (
    <>
      <PageHeader
        title="FAQ"
        subtitle={`${visible} question${visible > 1 ? "s" : ""} affichée${visible > 1 ? "s" : ""} sur la page Contact · ${items.length - visible} masquée${items.length - visible > 1 ? "s" : ""}`}
        actions={
          <>
            <ButtonLink href="/admin/contenus?onglet=contact" tone="secondary">
              Titre de la section
            </ButtonLink>
            <ButtonLink href="/admin/faq?q=nouvelle" tone="primary">
              + Nouvelle question
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-[1fr_340px] items-start gap-3 max-[1099px]:grid-cols-1">
        <div className="flex flex-col gap-2">
          {items.length === 0 && <p className="rounded-card bg-white p-6 text-sm text-muted">Aucune question. Ajoutez la première à droite.</p>}
          {items.map((f, i) => (
            <div key={i} className={`grid grid-cols-[auto_1fr_auto] items-start gap-4 rounded-[20px] border-[1.5px] bg-white px-5 py-4 ${i === selected && !isNew ? "border-ink" : "border-transparent"}`}>
              <div className="flex flex-col gap-0.5 pt-0.5 text-[#ccc]">
                <ActionForm action={moveFaqItemAction} submitLabel="▲" submitTone="ghost" className="!gap-0 [&>div:last-child]:contents [&_button]:!px-0 [&_button]:py-0 [&_button]:text-[10px] [&_button]:text-[#bbb]">
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="dir" value="-1" />
                </ActionForm>
                <ActionForm action={moveFaqItemAction} submitLabel="▼" submitTone="ghost" className="!gap-0 [&>div:last-child]:contents [&_button]:!px-0 [&_button]:py-0 [&_button]:text-[10px] [&_button]:text-[#bbb]">
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="dir" value="1" />
                </ActionForm>
              </div>
              <Link href={`/admin/faq?q=${i}`} className="flex min-w-0 flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  {f.cat && <Pill tone={CAT_TONE[f.cat] ?? "neutral"}>{f.cat}</Pill>}
                  {f.hidden && <Pill tone="muted">Masquée</Pill>}
                </span>
                <span className="text-[0.9375rem] font-bold leading-snug">{f.q}</span>
                <span className="truncate text-[0.8125rem] text-muted">{f.a}</span>
              </Link>
              <ActionForm action={toggleFaqItemAction} hideFooter className="!gap-0">
                <input type="hidden" name="index" value={i} />
                <AutoSubmitSwitch label={f.hidden ? "Afficher sur le site" : "Masquer sur le site"} defaultChecked={!f.hidden} />
              </ActionForm>
            </div>
          ))}
        </div>

        <Card title={isNew || !current ? "Nouvelle question" : "Modifier la question"} className="sticky top-6">
          <ActionForm key={isNew ? "new" : selected} action={saveFaqItemAction} submitLabel="Enregistrer">
            <input type="hidden" name="index" value={isNew || !current ? -1 : selected} />
            <Field label="Rubrique" name="cat">
              <Select name="cat" defaultValue={current && !isNew ? current.cat || "" : CATEGORIES[0]}>
                <option value="">- Sans rubrique -</option>
                {[...new Set([...CATEGORIES, ...items.map((f) => f.cat).filter(Boolean)])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Question" name="q">
              <Textarea name="q" rows={2} required defaultValue={current && !isNew ? current.q : ""} className="!min-h-0 !font-bold" />
            </Field>
            <Field label="Réponse" name="a">
              <Textarea name="a" rows={6} required defaultValue={current && !isNew ? current.a : ""} className="!font-medium" />
            </Field>
            <Switch name="hidden" label="Masquer sur le site" hint="Conservée ici, absente de la page Contact." defaultChecked={current && !isNew ? current.hidden : false} />
          </ActionForm>
          {current && !isNew && (
            <ActionForm action={deleteFaqItemAction} submitLabel="Supprimer cette question" submitTone="ghost" confirm="Supprimer cette question ?" className="!gap-0 border-t border-line-soft pt-3 [&>div:last-child]:justify-start [&_button]:!px-0 [&_button]:text-xs [&_button]:text-accent">
              <input type="hidden" name="index" value={selected} />
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
