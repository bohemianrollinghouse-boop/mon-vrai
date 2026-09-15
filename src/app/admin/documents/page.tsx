import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { DocumentFields } from "@/components/admin/DocumentFields";
import { ButtonLink, Card, Field, FilterPills, GridTable, Input, Notice, PageHeader, Pill, Thumb, Tile } from "@/components/admin/ui";
import { deleteDocumentAction, saveIsbnAction, updateDocumentAction, uploadDocumentAction } from "@/lib/admin/actions/documents";
import { docStatus, needsAttention } from "@/lib/admin/doc-status";
import { DOC_KIND_LABELS, DOC_KIND_TONE, dayLabel, fileSize } from "@/lib/admin/expense-ui";
import { requireAdmin } from "@/lib/auth/session";
import { listDocuments } from "@/lib/db/documents";
import { listExpenses } from "@/lib/db/expenses";
import { now as clock } from "@/lib/db/helpers";
import { listAllProducts } from "@/lib/db/products";
import { formatIsbn, normalizeIsbn } from "@/lib/domain/isbn";
import { formatEuro } from "@/lib/domain/money";
import type { DocKind } from "@/lib/domain/types";
import { dayKey } from "@/lib/stats/keys";

export const dynamic = "force-dynamic";

/*
 * Bibliothèque des pièces de la société : normes CE, rapports de laboratoire,
 * attributions d'ISBN, factures fournisseurs, contrats, assurances.
 *
 * Rien n'est public ici — c'est toute la différence avec la médiathèque. Le fichier va
 * dans un dossier fermé du bucket et n'est servi que par /api/documents/<id>, à un
 * administrateur connecté.
 *
 * L'attribution des ISBN vit au bas de cette page, et non dans la fiche produit : on
 * saisit un ISBN l'attestation sous les yeux, pas en modifiant un prix.
 */

const STATUS_PILL = {
  expired: { tone: "pink", label: "périmé" },
  soon: { tone: "warn", label: "bientôt" },
  valid: { tone: "ok", label: "valide" },
  none: { tone: "muted", label: "" },
} as const;

export default async function DocumentsPage({ searchParams }: PageProps<"/admin/documents">) {
  await requireAdmin();
  const { nature } = await searchParams;

  const [documents, products, expenses] = await Promise.all([listDocuments(), listAllProducts(), listExpenses()]);
  const today = dayKey(clock());
  const alerts = needsAttention(documents, today);

  const kind = typeof nature === "string" && nature in DOC_KIND_LABELS ? (nature as DocKind) : null;
  const shown = kind ? documents.filter((d) => d.kind === kind) : documents;

  const counts = new Map<DocKind, number>();
  for (const d of documents) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);

  const titleOf = (slug: string) => products.find((p) => p.slug === slug)?.title ?? slug;
  /** Ce que la pièce a coûté : la ligne de dépense qui la donne pour justificatif. */
  const costOf = (id: string) => expenses.filter((e) => e.documentId === id).reduce((s, e) => s + e.amount, 0);
  const withIsbn = products.filter((p) => p.isbn).length;

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Les pièces de la société : conformité, laboratoire, ISBN, contrats. Privées — elles ne sont visibles que d'ici."
        actions={<ButtonLink href="/admin/depenses">Voir les dépenses</ButtonLink>}
      />

      {alerts.length > 0 && (
        <Notice tone={alerts.some((d) => docStatus(d.expiresAt, today) === "expired") ? "error" : "info"}>
          {alerts.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              <strong>{d.title}</strong> {docStatus(d.expiresAt, today) === "expired" ? "a expiré" : "expire"} le {dayLabel(d.expiresAt)}
            </span>
          ))}
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-3 max-[1099px]:grid-cols-2">
        <Tile label="Pièces classées" value={documents.length.toLocaleString("fr-FR")} note={`${counts.get("certification") ?? 0} de conformité · ${counts.get("lab") ?? 0} de laboratoire`} />
        <Tile tone={alerts.length > 0 ? "sand" : "green"} label="À surveiller" value={alerts.length.toLocaleString("fr-FR")} note={alerts.length === 0 ? "aucune échéance proche" : "échéance passée ou dans moins de 2 mois"} />
        <Tile tone="blue" label="ISBN attribués" value={`${withIsbn} / ${products.length}`} note="titres du catalogue" />
        <Tile tone="dark" label="Poids du dossier" value={fileSize(documents.reduce((s, d) => s + d.size, 0))} note="stockage privé" />
      </div>

      <Card collapsible defaultOpen title="Déposer une pièce" aside={<span className="text-xs font-bold text-subtle">PDF, photo, tableur, archive — 40 Mo max</span>}>
        {/* Même ruse que sur les dépenses : la clé change après un dépôt, le formulaire se vide. */}
        <ActionForm key={`depot-${documents.length}`} action={uploadDocumentAction} submitLabel="Déposer" footerNote="Le fichier n'est jamais publié sur le site : il reste dans un dossier privé.">
          <Field label="Fichier" hint="PDF, JPEG, PNG, WebP, TIFF, CSV, Word, Excel ou ZIP." name="file">
            <input type="file" name="file" accept="application/pdf,image/*,text/csv,.doc,.docx,.xls,.xlsx,.zip" className="text-sm" required />
          </Field>
          <DocumentFields products={products} />
        </ActionForm>
      </Card>

      {documents.length > 1 && (
        <FilterPills
          items={[
            { href: "/admin/documents", label: "Toutes", count: documents.length, active: !kind },
            ...(Object.keys(DOC_KIND_LABELS) as DocKind[])
              .filter((k) => counts.has(k))
              .map((k) => ({ href: `/admin/documents?nature=${k}`, label: DOC_KIND_LABELS[k], count: counts.get(k), active: kind === k })),
          ]}
        />
      )}

      {shown.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted">
          {documents.length === 0 ? "Aucune pièce déposée. Commencez par vos attestations de conformité et vos rapports de laboratoire : ce sont celles qu'on cherche toujours dans l'urgence." : "Aucune pièce de cette nature."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((d) => {
            const status = docStatus(d.expiresAt, today);
            const cost = costOf(d.id);
            return (
              <Card
                key={d.id}
                collapsible
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{d.title}</span>
                    <Pill tone={DOC_KIND_TONE[d.kind]}>{DOC_KIND_LABELS[d.kind]}</Pill>
                    {status !== "none" && <Pill tone={STATUS_PILL[status].tone}>{STATUS_PILL[status].label}</Pill>}
                  </span>
                }
                aside={
                  <span className="text-xs font-semibold text-subtle">
                    {d.productSlug ? `${titleOf(d.productSlug)} · ` : ""}
                    {d.issuedAt ? dayLabel(d.issuedAt) : "sans date"}
                    {d.expiresAt ? ` → ${dayLabel(d.expiresAt)}` : ""}
                  </span>
                }
              >
                <div className="flex flex-wrap items-center gap-3 text-xs text-subtle">
                  <ButtonLink href={`/api/documents/${d.id}`} target="_blank" prefetch={false}>
                    Ouvrir le fichier
                  </ButtonLink>
                  <span>
                    {d.filename} · {fileSize(d.size)}
                  </span>
                  {d.reference && <span>Réf. {d.reference}</span>}
                  {d.isbn && <span>ISBN {formatIsbn(d.isbn)}</span>}
                  {cost > 0 && (
                    <Link href="/admin/depenses" className="font-bold hover:underline">
                      Coût rattaché : {formatEuro(cost)}
                    </Link>
                  )}
                </div>

                <ActionForm action={updateDocumentAction} submitLabel="Enregistrer">
                  <DocumentFields doc={d} products={products} />
                </ActionForm>

                {/* Formulaire distinct, à côté et non dedans : deux <form> imbriqués n'existent pas en HTML. */}
                <ActionForm
                  action={deleteDocumentAction}
                  submitLabel="Supprimer cette pièce"
                  submitTone="danger"
                  confirm={`Supprimer « ${d.title} » ? Le fichier sera effacé et les frais qui s'y rattachent perdront leur justificatif.`}
                  className="border-t border-line-soft pt-3.5"
                  footerNote="Le fichier est effacé du stockage : c'est sans retour."
                >
                  <input type="hidden" name="id" value={d.id} />
                </ActionForm>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="ISBN des livres" aside={<span className="text-xs font-bold text-subtle">Un ISBN par titre, clé vérifiée</span>} className="!p-6 [&>div:last-child]:-mx-6 [&>div:last-child]:rounded-none [&>div:last-child]:py-0">
        <p className="text-[0.8125rem] text-muted">
          L'ISBN saisi ici est celui de la fiche produit : il sert aux libraires, au dépôt légal et aux exports. La clé de contrôle est vérifiée et un même numéro ne peut pas coiffer deux titres.
        </p>
        <GridTable
          columns="56px 1fr 220px 150px 110px"
          head={["", "Titre", "ISBN", "Attestation", ""]}
          empty="Aucun titre au catalogue."
          rows={products.map((p) => {
            const attestation = documents.find((d) => d.isbn && p.isbn && normalizeIsbn(d.isbn) === normalizeIsbn(p.isbn)) ?? documents.find((d) => d.kind === "isbn" && d.productSlug === p.slug);
            return {
              key: p.slug,
              cells: [
                <Thumb key="v" src={p.images[0]?.url} tint={p.tint} size={40} />,
                <span key="t" className="flex min-w-0 flex-col">
                  <Link href={`/admin/produits/${p.slug}`} className="truncate font-bold hover:underline">
                    {p.title}
                  </Link>
                  {p.isbn && <span className="text-xs text-subtle">{formatIsbn(p.isbn)}</span>}
                </span>,
                <ActionForm key="f" action={saveIsbnAction} hideFooter id={`isbn-${p.slug}`} className="gap-0">
                  <input type="hidden" name="slug" value={p.slug} />
                  <Input name="isbn" defaultValue={p.isbn ?? ""} placeholder="978-2-…" maxLength={20} aria-label={`ISBN de ${p.title}`} className="!py-2 text-xs" />
                </ActionForm>,
                <span key="a" className="truncate text-xs text-subtle">
                  {attestation ? (
                    <Link href={`/api/documents/${attestation.id}`} target="_blank" className="font-bold hover:underline">
                      {attestation.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </span>,
                <button key="b" type="submit" form={`isbn-${p.slug}`} className="rounded-pill bg-ink px-3.5 py-2 text-[0.6875rem] font-bold text-on-ink hover:opacity-80">
                  Enregistrer
                </button>,
              ],
            };
          })}
        />
      </Card>
    </>
  );
}
