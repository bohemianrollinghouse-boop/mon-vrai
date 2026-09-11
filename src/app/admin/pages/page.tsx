import Link from "next/link";
import { ButtonLink, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listPages } from "@/lib/db/pages";
import { pagePath } from "@/lib/domain/system-pages";
import type { Page } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Liste des pages, groupée par catégorie. La catégorie est un texte libre saisi sur
 * la page elle-même : les rubriques apparaissent et disparaissent avec les pages,
 * sans écran de gestion à tenir. « Sans catégorie » ferme la marche.
 */
const UNSORTED = "Sans catégorie";

function byCategory(pages: Page[]): [string, Page[]][] {
  const groups = new Map<string, Page[]>();
  for (const p of pages) {
    const key = p.category || UNSORTED;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNSORTED) return 1;
    if (b === UNSORTED) return -1;
    return a.localeCompare(b, "fr");
  });
}

export default async function PagesAdmin() {
  const pages = await listPages();
  const groups = byCategory(pages);

  return (
    <>
      <PageHeader
        title="Pages"
        subtitle="Pages composées en blocs. Ajoutez-les à un menu pour les rendre accessibles ; l'une d'elles peut servir d'accueil."
        actions={
          <ButtonLink href="/admin/pages/nouvelle" tone="primary">
            + Nouvelle page
          </ButtonLink>
        }
      />
      {pages.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted">Aucune page pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([category, items]) => (
            <section key={category} className="flex flex-col gap-2.5">
              <h2 className="flex items-baseline gap-2 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-faint">
                {category}
                <span className="font-semibold normal-case tracking-normal text-subtle">
                  {items.length} page{items.length > 1 ? "s" : ""}
                </span>
              </h2>
              <Table head={["Titre", "Adresse", "Modifiée", "Statut"]}>
                {items.map((p) => (
                  <tr key={p.slug} className="hover:bg-paper">
                    <td>
                      <Link href={`/admin/pages/${p.slug}`} className="font-bold hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="text-subtle">{p.home ? "/" : pagePath(p.slug)}</td>
                    <td className="text-subtle">{new Date(p.updatedAt).toLocaleDateString("fr-FR")}</td>
                    <td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={p.status === "published" ? "ok" : "muted"}>{p.status === "published" ? "Publiée" : "Brouillon"}</Pill>
                        {p.home && <Pill tone="blue">Accueil</Pill>}
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
