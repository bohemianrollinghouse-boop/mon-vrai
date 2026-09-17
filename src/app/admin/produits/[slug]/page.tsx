import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { listMedia } from "@/lib/db/media";
import { getProduct } from "@/lib/db/products";

export const dynamic = "force-dynamic";

/** `/admin/produits/nouveau` ouvre un formulaire vide ; tout autre slug charge le produit. */
export default async function ProductEditPage({ params }: PageProps<"/admin/produits/[slug]">) {
  const { slug } = await params;
  const isNew = slug === "nouveau";
  /* La médiathèque voyage avec le formulaire : le « + » des photos l'ouvre sur place,
     plutôt que de faire sortir de la fiche pour y revenir ensuite. */
  const [product, media] = await Promise.all([isNew ? Promise.resolve(null) : getProduct(slug), listMedia()]);
  if (!isNew && !product) notFound();
  return <ProductForm product={product} media={media} />;
}
