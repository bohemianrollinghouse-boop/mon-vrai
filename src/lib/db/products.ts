import "server-only";
import { Product } from "@/lib/domain/types";
import { col, now, parseDoc, parseQuery } from "./helpers";

const products = () => col("products");

export async function listPublishedProducts(): Promise<Product[]> {
  return parseQuery(Product, products().where("status", "==", "published").orderBy("position"));
}

export async function listAllProducts(): Promise<Product[]> {
  return parseQuery(Product, products().orderBy("position"));
}

export async function getProduct(slug: string): Promise<Product | null> {
  return parseDoc(Product, await products().doc(slug).get());
}

/** Charge plusieurs produits d'un coup (panier, commande). Les absents manquent simplement. */
export async function getProductsBySlugs(slugs: string[]): Promise<Map<string, Product>> {
  const unique = [...new Set(slugs)];
  const out = new Map<string, Product>();
  if (unique.length === 0) return out;
  const snaps = await Promise.all(unique.map((s) => products().doc(s).get()));
  for (const snap of snaps) {
    const p = parseDoc(Product, snap);
    if (p) out.set(p.slug, p);
  }
  return out;
}

/**
 * Recherche plein texte minimale, en mémoire : le catalogue compte une dizaine de
 * titres, une indexation externe serait disproportionnée. À revoir au-delà de
 * quelques centaines de produits.
 */
export async function searchPublishedProducts(query: string): Promise<Product[]> {
  const q = normalize(query);
  if (!q) return [];
  const all = await listPublishedProducts();
  return all.filter((p) => {
    const hay = normalize([p.title, p.subtitle, p.ageLabel, ...p.items, stripHtml(p.descriptionHtml)].join(" "));
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

export type ProductInput = Omit<Product, "createdAt" | "updatedAt">;

export async function upsertProduct(input: ProductInput): Promise<Product> {
  const ref = products().doc(input.slug);
  const existing = parseDoc(Product, await ref.get());
  const doc: Product = Product.parse({
    ...input,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return doc;
}

export async function deleteProduct(slug: string): Promise<void> {
  await products().doc(slug).delete();
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

/** Ajuste le stock d'un titre suivi de ±n, sans passer sous zéro. Renvoie le nouveau stock. */
export async function adjustStock(slug: string, delta: number): Promise<number | null> {
  const ref = col("products").doc(slug);
  const product = parseDoc(Product, await ref.get());
  if (!product) throw new Error(`Produit ${slug} introuvable`);
  if (product.stock === null) return null;
  const next = Math.max(0, product.stock + delta);
  await ref.update({ stock: next, updatedAt: now() });
  return next;
}
