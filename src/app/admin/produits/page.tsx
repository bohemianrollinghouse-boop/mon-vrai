import Link from "next/link";
import { ButtonLink, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listAllProducts } from "@/lib/db/products";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

const BADGE = { none: "—", new: "Nouveauté", reissue: "Nouvelle édition" } as const;

export default async function ProductsPage() {
  const products = await listAllProducts();
  return (
    <>
      <PageHeader
        title="Produits"
        subtitle={`${products.length} livres · ${products.filter((p) => p.status === "published").length} publiés`}
        actions={
          <ButtonLink href="/admin/produits/nouveau" tone="primary">
            + Nouveau produit
          </ButtonLink>
        }
      />
      <Table head={["Ordre", "Titre", "Prix", "Pastille", "Stock", "Statut"]}>
        {products.map((p) => (
          <tr key={p.slug} className="hover:bg-paper">
            <td className="text-subtle">{p.position}</td>
            <td>
              <Link href={`/admin/produits/${p.slug}`} className="flex items-center gap-3 font-bold hover:underline">
                {p.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette admin
                  <img src={p.images[0].url} alt="" className="h-9 w-9 rounded-md object-cover" />
                )}
                {p.title}
              </Link>
            </td>
            <td>{formatEuro(p.price)}</td>
            <td>{BADGE[p.badge]}</td>
            <td>{p.stock === null ? <span className="text-subtle">non suivi</span> : p.stock}</td>
            <td>
              <Pill tone={p.status === "published" ? "ok" : "muted"}>{p.status === "published" ? "Publié" : "Brouillon"}</Pill>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
