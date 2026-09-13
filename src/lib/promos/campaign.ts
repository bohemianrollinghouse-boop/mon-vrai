import type { Campaign } from "@/lib/domain/types";

/*
 * Ce qu'on sait dire d'une campagne sans toucher à la base. Pur : la caisse, l'espace
 * partenaire, l'administration et les scripts s'en servent tous, et doivent répondre la
 * même chose — notamment sur la seule question qui compte pour un code promo : cette
 * campagne est-elle encore en cours ?
 */

/** Le début d'une campagne : sa date propre, à défaut son ouverture. */
export const campaignStart = (c: Campaign): number => c.startAt ?? c.createdAt;

/*
 * Une campagne « vivante » : ni terminée ni annulée, et dans sa fenêtre de dates. C'est
 * elle, et elle seule, qui fait vivre un code promo — une campagne close ou passée ne
 * remise plus rien.
 *
 * Le suivi des liens, lui, ne s'arrête jamais : une vente attribuée par un lien reste
 * attribuée même des mois après la fin de la campagne (voir /api/ref et l'engin).
 */
export function campaignLive(c: Campaign, now: number): boolean {
  if (c.status === "completed" || c.status === "cancelled") return false;
  if (campaignStart(c) > now) return false;
  if (c.endAt && c.endAt < now) return false;
  return true;
}

/*
 * La campagne à laquelle un partenaire a affaire aujourd'hui : celle qui est en cours,
 * sinon la dernière ouverte. Terminée ou annulée, une campagne ne propose plus rien —
 * ni kit, ni contrat, ni code.
 *
 * La liste est attendue triée par rang décroissant (listCampaigns le fait) : entre deux
 * campagnes du même état, la plus récente l'emporte.
 */
export const liveCampaign = (list: Campaign[]): Campaign | null =>
  list.find((c) => c.status === "active") ?? list.find((c) => c.status === "draft") ?? null;

/** Le code d'un partenaire aujourd'hui : celui de sa campagne en cours, s'il y en a un. */
export const currentCode = (list: Campaign[]): string => liveCampaign(list)?.code ?? "";

/** La remise offerte aujourd'hui à sa communauté, en pourcentage. */
export const currentDiscount = (list: Campaign[]): number => liveCampaign(list)?.discount ?? 0;
