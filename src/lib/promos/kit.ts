import type { ImageRef, OrderLine, Product, WelcomeKit } from "@/lib/domain/types";

/*
 * Kit de bienvenue des partenaires.
 *
 * Chaque partenaire a le sien, choisi dans sa fiche ; la sélection ne garde que des
 * slugs, si bien qu'un titre renommé ou un visuel remplacé suit tout seul. La commande
 * qui en naît vaut 0 € et ne touche au stock de vente que si on l'a demandé
 * (voir `createKitOrder`).
 *
 * Tout est pur, pour que l'espace partenaire et l'action de commande voient exactement
 * la même chose — et qu'un produit dépublié disparaisse des deux côtés à la fois.
 */

export type KitItem = { slug: string; title: string; qty: number; image?: ImageRef; weightG: number };

/** Les articles du kit, dans l'ordre choisi, en ignorant les produits disparus. */
export function kitItems(kit: WelcomeKit, products: Product[]): KitItem[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return kit.lines.flatMap((line) => {
    const product = bySlug.get(line.slug);
    if (!product) return [];
    return [{ slug: product.slug, title: product.title, qty: line.qty, image: product.images[0], weightG: product.weightG }];
  });
}

/** Le kit est-il proposable ? Activé, et au moins un livre encore disponible. */
export function kitOffered(kit: WelcomeKit, items: KitItem[]): boolean {
  return kit.enabled && items.length > 0;
}

/** Lignes de commande correspondantes : offertes, donc à 0 € et marquées `gift`. */
export function kitOrderLines(items: KitItem[]): OrderLine[] {
  return items.map((i) => ({
    productSlug: i.slug,
    title: i.title,
    qty: i.qty,
    unitPrice: 0,
    image: i.image,
    preorder: false,
    gift: true,
    weightG: i.weightG,
  }));
}

/** Poids du colis du kit (hors emballage), en grammes. */
export function kitWeightG(items: KitItem[]): number {
  return items.reduce((sum, i) => sum + i.weightG * i.qty, 0);
}
