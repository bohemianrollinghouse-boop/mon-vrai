import { notFound } from "next/navigation";
import { DeleteProductForm, ProductForm } from "@/components/admin/ProductForm";
import { Card, PageHeader } from "@/components/admin/ui";
import { getProduct } from "@/lib/db/products";

export const dynamic = "force-dynamic";

/** `/admin/produits/nouveau` ouvre un formulaire vide ; tout autre slug charge le produit. */
export default async function ProductEditPage({ params }: PageProps<"/admin/produits/[slug]">) {
  const { slug } = await params;
  const isNew = slug === "nouveau";
  const product = isNew ? null : await getProduct(slug);
  if (!isNew && !product) notFound();

  return (
    <>
      <PageHeader title={product ? product.title : "Nouveau produit"} subtitle={product ? `/livres/${product.slug}` : "Le livre sera créé en brouillon tant que vous ne le publiez pas."} />
      <ProductForm product={product} />
      {product && (
        <Card title="Zone dangereuse" className="mt-8 border border-danger-bg">
          <DeleteProductForm slug={product.slug} title={product.title} />
        </Card>
      )}
    </>
  );
}
