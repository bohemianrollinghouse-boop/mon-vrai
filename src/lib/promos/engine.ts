import type { Influencer, Promo } from "@/lib/domain/types";

/*
 * Moteur des codes promo, sans effet de bord : on lui donne le panier chiffré, les codes
 * saisis, le contexte (date, client, influenceur du lien) et il rend ce qui s'applique.
 * Le panier, la caisse et le PaymentIntent partagent ce calcul : un seul total possible.
 *
 * Règles :
 *  - un code doit être actif, dans sa période, sous sa limite globale et par client, et
 *    le panier doit atteindre son minimum ;
 *  - deux codes ne se cumulent que si l'un des deux déclare l'autre dans `stackWith`
 *    (`__influ` désigne n'importe quel code influenceur) ;
 *  - un lien influenceur (cookie) applique automatiquement le code de l'influenceur, et
 *    attribue la vente ; un code influenceur tapé prime sur le lien.
 */

export type PricedItem = { slug: string; qty: number; unitPrice: number; title: string; stock: number | null };

export type PromoContext = {
  now: number;
  subtotal: number;
  items: PricedItem[];
  /** Combien de fois ce client (e-mail) a déjà utilisé chaque code. */
  usedByCustomer: Record<string, number>;
  /** Influenceur du lien de suivi (cookie), s'il y en a un. */
  refInfluencer: Influencer | null;
  promos: Map<string, Promo>;
  influencers: Map<string, Influencer>;
};

export type Applied = { code: string; type: Promo["type"]; label: string; amount: number; influencerId?: string; viaLink: boolean; gifts: string[] };
export type Rejected = { code: string; reason: string };

export type PromoOutcome = {
  applied: Applied[];
  rejected: Rejected[];
  discount: number;
  freeShipping: boolean;
  giftLines: { slug: string; qty: number }[];
  attribution: { influencerId: string; via: "code" | "link" } | null;
};

export function promoLabel(p: Pick<Promo, "type" | "amount" | "gifts">): string {
  switch (p.type) {
    case "percent":
      return `−${p.amount} %`;
    case "fixed":
      return `−${(p.amount / 100).toFixed(2).replace(".", ",").replace(",00", "")} €`;
    case "free_shipping":
      return "Livraison offerte";
    case "gift":
      return p.gifts.length > 1 ? `${p.gifts.length} produits offerts` : "Produit offert";
  }
}

/** Pourquoi un code n'est pas utilisable maintenant, ou null s'il l'est. */
export function rejectionReason(p: Promo, ctx: PromoContext, influencer?: Influencer | null): string | null {
  if (!p.active) return "Ce code n'est plus actif.";
  if (p.startAt > ctx.now) return "Ce code n'est pas encore valable.";
  if (p.endAt && p.endAt < ctx.now) return "Ce code a expiré.";
  if (p.limit && p.uses >= p.limit) return "Ce code a atteint son nombre d'utilisations.";
  if ((ctx.usedByCustomer[p.code] ?? 0) >= p.perCustomer) return "Vous avez déjà utilisé ce code.";
  if (p.minimum && ctx.subtotal < p.minimum) return `Ce code s'applique à partir de ${(p.minimum / 100).toFixed(2).replace(".", ",")} € d'achats.`;
  if (p.influencerId) {
    if (!influencer || !influencer.active) return "Ce code n'est plus actif.";
    if (influencer.endAt && influencer.endAt < ctx.now) return "Cette campagne est terminée.";
  }
  if (p.type === "gift" && !p.gifts.length) return "Ce code n'offre rien pour l'instant.";
  return null;
}

/** Marqueur « cumulable avec n'importe quel code influenceur », insensible à la casse. */
const INFLU_MARK = (list: string[]) => list.some((c) => c.toLowerCase() === "__influ");

export function canStack(a: Promo, b: Promo): boolean {
  const lists = (x: Promo, y: Promo) => x.stackWith.includes(y.code) || (Boolean(y.influencerId) && INFLU_MARK(x.stackWith));
  return lists(a, b) || lists(b, a);
}

export function applyPromos(codes: string[], ctx: PromoContext): PromoOutcome {
  const applied: Applied[] = [];
  const rejected: Rejected[] = [];
  const kept: Promo[] = [];

  const consider = (code: string, viaLink: boolean) => {
    const p = ctx.promos.get(code.toUpperCase());
    if (!p) return void rejected.push({ code, reason: "Code inconnu." });
    if (kept.some((k) => k.code === p.code)) return;
    const influencer = p.influencerId ? ctx.influencers.get(p.influencerId) ?? null : null;
    const reason = rejectionReason(p, ctx, influencer);
    if (reason) return void rejected.push({ code, reason });
    const clash = kept.find((k) => !canStack(k, p));
    if (clash) return void rejected.push({ code, reason: `Non cumulable avec ${clash.code}.` });
    kept.push(p);
    applied.push({ code: p.code, type: p.type, label: promoLabel(p), amount: 0, influencerId: p.influencerId, viaLink, gifts: p.type === "gift" ? p.gifts : [] });
  };

  for (const code of codes) consider(code, false);

  // Lien influenceur : son code s'applique tout seul, sauf si un code influenceur est déjà là.
  const ref = ctx.refInfluencer;
  const hasInfluencerCode = kept.some((k) => k.influencerId);
  if (ref && ref.active && !(ref.endAt && ref.endAt < ctx.now) && !hasInfluencerCode) {
    const before = rejected.length;
    consider(ref.code, true);
    // Un refus du code du lien n'est pas une erreur à montrer au client.
    if (rejected.length > before) rejected.splice(before);
  }

  // Remises : les montants fixes d'abord, puis les pourcentages sur ce qui reste ; jamais sous zéro.
  let remaining = ctx.subtotal;
  for (const a of applied.filter((x) => x.type === "fixed")) {
    const p = ctx.promos.get(a.code)!;
    a.amount = Math.min(remaining, p.amount);
    remaining -= a.amount;
  }
  for (const a of applied.filter((x) => x.type === "percent")) {
    const p = ctx.promos.get(a.code)!;
    a.amount = Math.min(remaining, Math.round((remaining * p.amount) / 100));
    remaining -= a.amount;
  }

  // Frais de livraison offerts : par le type dédié, ou par la case cochée sur n'importe quel autre code.
  const freeShipping = applied.some((a) => a.type === "free_shipping" || ctx.promos.get(a.code)?.freeShipping === true);
  const giftLines = applied.flatMap((a) => a.gifts).filter((slug, i, arr) => arr.indexOf(slug) === i).map((slug) => ({ slug, qty: 1 }));

  const byCode = applied.find((a) => a.influencerId && !a.viaLink);
  const byLink = applied.find((a) => a.influencerId && a.viaLink);
  const attribution = byCode ? { influencerId: byCode.influencerId!, via: "code" as const } : byLink || (ref && ref.active) ? { influencerId: (byLink?.influencerId ?? ref!.id), via: "link" as const } : null;

  return { applied, rejected, discount: applied.reduce((s, a) => s + a.amount, 0), freeShipping, giftLines, attribution };
}

/** Statut d'un code pour l'admin : Actif, Programmé (pas encore commencé ou désactivé), Expiré. */
export function promoStatus(p: Promo, now: number): "Actif" | "Programmé" | "Expiré" {
  if (p.endAt && p.endAt < now) return "Expiré";
  if (p.limit && p.uses >= p.limit) return "Expiré";
  if (!p.active || p.startAt > now) return "Programmé";
  return "Actif";
}

export function generateCode(prefix = "MV"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}${out}`;
}
