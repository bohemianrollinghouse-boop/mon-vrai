import { carrierOf } from "@/lib/boxtal/offers";
import { parcelWeightKg } from "@/lib/boxtal/request";
import type { Expense, Order, SiteSettings } from "@/lib/domain/types";
import { bracketIndexForWeight, supplierCost } from "@/lib/shipping/tariffs";

/*
 * Ce que coûte l'étiquette d'un colis OFFERT, en mouvement de trésorerie : le kit d'un
 * partenaire, le lot d'un gagnant de concours.
 *
 * Ni l'un ni l'autre ne se facture : les livres sont offerts et le port l'est aussi —
 * pour celui qui reçoit. Il ne l'est pas pour la maison, qui paie l'étiquette chez
 * Boxtal. Cette sortie n'apparaissait nulle part dans /admin/depenses : cet écran écarte
 * les colis offerts des ventes (ils n'encaissent rien), et une dépense ne s'y inscrit
 * que si on la saisit.
 *
 * D'où une ligne écrite d'office à la création de l'étiquette, une par colis — et pour
 * les colis offerts seulement : les étiquettes des ventes sont déjà retirées du revenu, commande par
 * commande, dans /admin/revenus. Fonctions pures : la ligne se calcule ici, elle s'écrit
 * dans `lib/boxtal/shipment.ts`.
 */

/*
 * Identifiant DÉDUIT de la commande, et non tiré au sort : deux créations d'étiquette
 * pour le même colis réécrivent la même ligne au lieu d'en empiler deux.
 *
 * Le préfixe distingue les deux sortes — et `exp_kit_` reste ce qu'il était : les lignes
 * de kits déjà posées doivent continuer de se retrouver, sans quoi la prochaine étiquette
 * en écrirait une seconde à côté.
 */
export const giftExpenseId = (order: Pick<Order, "id" | "prize">) => `exp_${order.prize ? "lot" : "kit"}_${order.id}`;

/** TVA de la prestation de transport. Boxtal annonce ses prix hors taxes ; on paie TTC. */
const VAT = 1.2;

/*
 * D'où vient le montant :
 * - `boxtal` : le prix rendu par Boxtal à la création de l'expédition, le vrai ;
 * - `bareme` : le barème fournisseur de `shipping/tariffs.ts`, quand Boxtal ne chiffre
 *   pas sa réponse — même estimation que le port réel de /admin/revenus ;
 * - `inconnu` : ni l'un ni l'autre (transporteur hors barème, expédition sans mode de
 *   livraison). La ligne est alors créée à zéro et « engagée », pour être complétée à
 *   la main plutôt que de manquer.
 */
export type CostSource = "boxtal" | "bareme" | "inconnu";

export function giftLabelCost(order: Order, settings: SiteSettings, priceExclTax?: number): { cents: number; source: CostSource } {
  if (priceExclTax && priceExclTax > 0) return { cents: Math.round(priceExclTax * 100 * VAT), source: "boxtal" };
  const rateId = order.delivery?.rateId;
  const weightG = Math.round(parcelWeightKg(order, settings) * 1000);
  const cost = rateId ? supplierCost(rateId, order.shippingAddress.country, bracketIndexForWeight(weightG)) : undefined;
  return cost === undefined ? { cents: 0, source: "inconnu" } : { cents: cost, source: "bareme" };
}

const SOURCE_NOTE: Record<CostSource, string> = {
  boxtal: "prix Boxtal, TTC",
  bareme: "estimation au barème Boxtal",
  inconnu: "montant à compléter : transporteur hors barème",
};

export type GiftLabelExpense = Omit<Expense, "createdAt" | "updatedAt">;

/*
 * La ligne de dépense d'une étiquette de colis offert. `day` est le jour de la commande
 * de l'étiquette (AAAA-MM-JJ) : c'est ce jour-là que l'argent sort, pas celui de la
 * collaboration ni du tirage. Aucun titre rattaché — le port d'un cadeau est un frais de
 * prospection, pas un coût de fabrication d'un imagier.
 *
 * `named` est le partenaire, ou le concours : de quoi reconnaître la ligne dans une liste
 * de dépenses. À défaut, le nom du destinataire fait l'affaire.
 */
export function giftLabelExpense(order: Order, settings: SiteSettings, named: string, day: string, priceExclTax?: number): GiftLabelExpense {
  const { cents, source } = giftLabelCost(order, settings, priceExclTax);
  const weightG = Math.round(parcelWeightKg(order, settings) * 1000);
  const carrier = carrierOf(order.delivery?.offerCode ?? "");
  const prize = Boolean(order.prize);
  const kind = prize ? "Lot" : "Kit";
  const seq = order.kit?.seq ?? 1;
  const who = named.trim() || order.shippingAddress.name.trim() || (prize ? "gagnant" : "influenceur");
  const parts = [`${kind} ${order.number}`, !prize && seq > 1 ? `${seq}e kit` : "", carrier, `${weightG} g`, SOURCE_NOTE[source]].filter(Boolean);
  return {
    id: giftExpenseId(order),
    direction: "out",
    category: "shipping",
    label: `Étiquette ${kind.toLowerCase()} — ${who}`.slice(0, 120),
    supplier: "Boxtal",
    amount: cents,
    date: day,
    method: "card",
    status: source === "inconnu" ? "pending" : "paid",
    recurrence: "once",
    productSlugs: [],
    documentIds: [],
    taxable: false,
    note: parts.join(" · ").slice(0, 500),
  };
}
