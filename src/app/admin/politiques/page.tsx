import Link from "next/link";
import { ButtonLink, PageHeader, Table } from "@/components/admin/ui";
import { listPolicies } from "@/lib/db/policies";

export const dynamic = "force-dynamic";

export default async function PoliciesAdmin() {
  const policies = await listPolicies();
  return (
    <>
      <PageHeader
        title="Pages légales"
        subtitle="Mentions légales, CGV, confidentialité… Affichées dans l'ordre ci-dessous sur /informations."
        actions={
          <ButtonLink href="/admin/politiques/nouvelle" tone="primary">
            + Nouvelle page légale
          </ButtonLink>
        }
      />
      <Table head={["Ordre", "Titre", "Adresse", "Modifiée"]}>
        {policies.map((p) => (
          <tr key={p.handle} className="hover:bg-paper">
            <td className="text-subtle">{p.position}</td>
            <td>
              <Link href={`/admin/politiques/${p.handle}`} className="font-bold hover:underline">
                {p.title}
              </Link>
            </td>
            <td className="text-subtle">/informations/{p.handle}</td>
            <td className="text-subtle">{new Date(p.updatedAt).toLocaleDateString("fr-FR")}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
