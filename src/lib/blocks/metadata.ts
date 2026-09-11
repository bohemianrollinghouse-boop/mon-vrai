import "server-only";
import { getContactContent } from "@/lib/db/content";
import { getFooterMenu } from "@/lib/db/menus";
import { listPublishedProducts } from "@/lib/db/products";
import { getSettings } from "@/lib/db/settings";
import type { Page } from "@/lib/domain/types";
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
const NEEDS_SIBLINGS = new Set(["GabaritLegal"]);

/** Tous les types de blocs du document, y compris ceux imbriqués dans les slots. */
export function blockTypes(doc: Page["blocks"] & object): Set<string> {
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

export async function buildBlockMetadata(page: Page, sort?: string): Promise<BlockMetadata> {
  const doc = page.blocks;
  if (!doc) return {};
  const types = blockTypes(doc);
  const wants = (set: Set<string>) => [...types].some((t) => set.has(t));

  const [products, settings, contact, footer] = await Promise.all([
    wants(NEEDS_PRODUCTS) ? listPublishedProducts() : undefined,
    wants(NEEDS_SETTINGS) ? getSettings() : undefined,
    wants(NEEDS_CONTACT) ? getContactContent() : undefined,
    wants(NEEDS_SIBLINGS) ? getFooterMenu() : undefined,
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
  if (footer) {
    /*
     * Les pages sœurs du sommaire sont celles de la colonne de pied qui contient la
     * page courante. Pas de nouvelle notion à tenir : ranger une page dans la colonne
     * « Informations » suffit à la faire apparaître dans le menu de gauche.
     */
    const column = footer.columns.find((c) => c.items.some((i) => i.target.kind === "page" && i.target.slug === page.slug));
    if (column) {
      metadata.legal = {
        heading: column.heading,
        current: page.slug,
        title: page.title,
        updatedAt: page.updatedAt,
        siblings: column.items
          .map((i) => (i.target.kind === "page" ? { slug: i.target.slug, title: i.label } : null))
          .filter((x): x is { slug: string; title: string } => x !== null),
      };
    }
  }
  if (contact) {
    metadata.contactForm = { subjects: contact.subjects, legal: contact.legal, successText: contact.successText };
    metadata.faq = contact.faq.items.filter((f) => !f.hidden).map((f) => ({ q: f.q, a: f.a }));
  }
  return metadata;
}
