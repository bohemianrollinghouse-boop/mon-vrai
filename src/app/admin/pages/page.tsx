import Link from "next/link";
import { ButtonLink, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listPages } from "@/lib/db/pages";

export const dynamic = "force-dynamic";

export default async function PagesAdmin() {
  const pages = await listPages();
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
        <Table head={["Titre", "Adresse", "Modifiée", "Statut"]}>
          {pages.map((p) => (
            <tr key={p.slug} className="hover:bg-paper">
              <td>
                <Link href={`/admin/pages/${p.slug}`} className="font-bold hover:underline">
                  {p.title}
                </Link>
              </td>
              <td className="text-subtle">{p.home ? "/" : `/pages/${p.slug}`}</td>
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
      )}
    </>
  );
}
