import "server-only";
import { getContactContent } from "@/lib/db/content";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import type { BlockDocument } from "@/lib/domain/types";
import { CATALOGUE_SORTS, type BlockMetadata } from "./config";

/*
 * Données ambiantes d'une page de blocs : ce que le site sait déjà (catalogue,
 * coordonnées, questions fréquentes), par opposition à ce que l'auteur a rédigé.
 *
 * On ne charge que ce que la page utilise réellement : une page légale n'a aucune
 * raison de lire le catalogue. D'où l'inventaire des types de blocs présents, slots
 * compris — un bloc déposé dans une colonne compte autant qu'un bloc de premier rang.
 */

const NEEDS_PRODUCTS = new Set(["Catalogue", "GrilleCatalogue", "HerosCatalogue"]);
const NEEDS_SETTINGS = new Set(["HerosContact", "HerosCatalogue"]);
const NEEDS_CONTACT = new Set(["HerosContact", "FormulaireContact", "FAQ"]);

/** Tous les types de blocs du document, y compris ceux imbriqués dans les slots. */
export function blockTypes(doc: BlockDocument): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as { type?: unknown; props?: unknown };
    if (typeof node.type === "string") found.add(node.type);
    if (node.props && typeof node.props === "object") {
      for (const v of Object.values(node.props as Record<string, unknown>)) walk(v);
    }
  };
  walk(doc.content);
  return found;
}

export async function buildBlockMetadata(doc: BlockDocument, sort?: string): Promise<BlockMetadata> {
  const types = blockTypes(doc);
  const wants = (set: Set<string>) => [...types].some((t) => set.has(t));

  const [products, settings, contact] = await Promise.all([
    wants(NEEDS_PRODUCTS) ? listPublishedProducts() : undefined,
    wants(NEEDS_SETTINGS) ? getSettings() : undefined,
    wants(NEEDS_CONTACT) ? getContactContent() : undefined,
  ]);

  const metadata: BlockMetadata = {};
  if (products) metadata.products = products;
  if (types.has("GrilleCatalogue")) {
    metadata.sort = CATALOGUE_SORTS.some((s) => s.value === sort) ? sort : "position";
  }
  if (settings) {
    metadata.collectionOffer = settings.promos.collectionOffer.enabled;
    metadata.contact = {
      email: settings.contact.email,
      socials: [
        { label: "Instagram", href: settings.socials.instagram },
        { label: "TikTok", href: settings.socials.tiktok },
        { label: "Facebook", href: settings.socials.facebook },
      ].filter((s): s is { label: string; href: string } => Boolean(s.href)),
    };
  }
  if (contact) {
    metadata.contactForm = { subjects: contact.subjects, legal: contact.legal, successText: contact.successText };
    metadata.faq = contact.faq.items.filter((f) => !f.hidden).map((f) => ({ q: f.q, a: f.a }));
  }
  return metadata;
}
