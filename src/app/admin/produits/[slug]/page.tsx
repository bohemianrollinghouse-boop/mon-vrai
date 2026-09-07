import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { getProduct } from "@/lib/db/products";

export const dynamic = "force-dynamic";

/** `/admin/produits/nouveau` ouvre un formulaire vide ; tout autre slug charge le produit. */
export default async function ProductEditPage({ params }: PageProps<"/admin/produits/[slug]">) {
  const { slug } = await params;
  const isNew = slug === "nouveau";
  const product = isNew ? null : await getProduct(slug);
  if (!isNew && !product) notFound();
  return <ProductForm product={product} />;
}
