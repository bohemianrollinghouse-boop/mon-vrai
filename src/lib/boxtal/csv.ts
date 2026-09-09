import type { Order, SiteSettings } from "@/lib/domain/types";
import { parcelWeightKg } from "./request";

/*
 * Génère le fichier d'import d'expédition Boxtal (CSV) pour une commande, au format du
 * modèle fourni par Boxtal : destinataire, point relais éventuel, colis, référence.
 * Sert de repli quand la création d'étiquette par l'API échoue (paiement, etc.) : on
 * importe ce CSV à la main dans Boxtal. Le transporteur est choisi à l'import, pas ici.
 */

const HEADERS = [
  "recipient_first_name",
  "recipient_last_name",
  "recipient_company",
  "recipient_address_line_1",
  "recipient_address_line_2",
  "recipient_postal_code",
  "recipient_city",
  "recipient_country_iso_code",
  "recipient_additional_information",
  "recipient_phone",
  "recipient_email",
  "recipient_proximity_point",
  "content_detailed_description",
  "content_category_code",
  "package_1_weight",
  "package_1_length",
  "package_1_width",
  "package_1_height",
  "package_1_value",
  "external_reference",
] as const;

const cell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`;
const num = (n: number, decimals = 2): string => n.toFixed(decimals).replace(/\.?0+$/, "") || "0";

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return [parts[0] || "Client", parts[0] || "Client"];
  return [parts[0], parts.slice(1).join(" ")];
}

/** Code catégorie numérique attendu par le CSV (ex. « 10150 »), extrait de l'id de contenu. */
function contentCategoryCode(settings: SiteSettings): string {
  const digits = (settings.shipping.parcel.contentCategoryId.match(/\d+/g) ?? []).pop();
  return digits || "10150";
}

export function buildBoxtalCsvRow(order: Order, settings: SiteSettings): string[] {
  const a = order.shippingAddress;
  const [first, last] = splitName(a.name);
  const p = settings.shipping.parcel;
  const value = Math.max(1, Math.round(order.totals.subtotal - order.totals.discount) / 100);
  const description = order.lines.map((l) => `${l.qty}x ${l.title}`).join(", ").slice(0, 250) || "Imagiers Mon Vrai";
  return [
    first,
    last,
    "",
    a.line1,
    a.line2 ?? "",
    a.postalCode,
    a.city,
    a.country,
    "",
    a.phone ?? "",
    order.email,
    order.delivery?.relay?.code ?? "",
    description,
    contentCategoryCode(settings),
    num(parcelWeightKg(order, settings), 3),
    num(p.lengthCm),
    num(p.widthCm),
    num(p.heightCm),
    num(value),
    order.number,
  ];
}

/** CSV complet (en-têtes + une ligne) pour une commande, terminaisons CRLF comme le modèle Boxtal. */
export function buildBoxtalCsv(order: Order, settings: SiteSettings): string {
  const header = HEADERS.map(cell).join(",");
  const row = buildBoxtalCsvRow(order, settings).map(cell).join(",");
  return `${header}\r\n${row}\r\n`;
}
