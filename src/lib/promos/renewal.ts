import { liveCampaign } from "./campaign";
import type { Campaign, Influencer } from "@/lib/domain/types";

/*
 * Ce qui se passe quand une campagne se termine, des deux côtés.
 *
 * Clore une campagne ne faisait rien voir à personne : le partenaire retrouvait un
 * espace sans kit et sans code, sans qu'un mot lui dise pourquoi, et nous n'avions
 * aucun moyen de savoir qu'il était partant pour repartir. Deux manques pour une même
 * raison : la fin d'une collaboration n'était écrite nulle part.
 *
 * Elle l'est ici, et elle se DÉDUIT. Une demande de nouvelle campagne ne porte pas de
 * statut qu'il faudrait refermer : elle ne vaut que tant qu'elle est postérieure à la
 * dernière campagne close. Ouvrir la campagne suivante y répond donc toute seule — la
 * campagne devient vivante, la demande disparaît —, et une demande ne peut pas survivre
 * à ce qu'elle réclamait. C'est la règle des campagnes et des concours : un état qu'on
 * ne maintient pas ne peut pas mentir.
 *
 * Pur et testé : l'espace partenaire et l'administration s'en servent tous les deux et
 * doivent dire la même chose.
 */

/** Le moment où une campagne a été close. `completedAt` manque sur les plus anciennes. */
export const closedAt = (c: Campaign): number => c.completedAt ?? c.updatedAt;

export type Renewal = {
  /** La dernière campagne terminée, quand il n'y en a plus aucune en cours. */
  done: Campaign | null;
  /** Une demande attend notre réponse. */
  asked: boolean;
  /** Quand elle a été faite ; zéro s'il n'y en a pas. */
  askedAt: number;
  /** Il peut en demander une : sa campagne est close et il ne l'a pas déjà demandée. */
  canAsk: boolean;
};

const NONE: Renewal = { done: null, asked: false, askedAt: 0, canAsk: false };

export function renewalState(influencer: Pick<Influencer, "renewalAskedAt">, campaigns: Campaign[]): Renewal {
  /* Une campagne en cours : il n'y a rien à renouveler, et rien à demander. */
  if (liveCampaign(campaigns)) return NONE;

  const done = [...campaigns].filter((c) => c.status === "completed").sort((a, b) => closedAt(b) - closedAt(a))[0] ?? null;
  /* Sans campagne close, il n'y a pas de fin à constater : un partenaire qu'on vient
     d'inscrire n'a pas à voir « campagne terminée ». */
  if (!done) return NONE;

  const asked = influencer.renewalAskedAt > closedAt(done);
  return { done, asked, askedAt: asked ? influencer.renewalAskedAt : 0, canAsk: !asked };
}

/** Les partenaires qui attendent une réponse, du plus ancien demandeur au plus récent. */
export function pendingRenewals<T extends { influencer: Influencer; campaigns: Campaign[] }>(rows: T[]): (T & { renewal: Renewal })[] {
  return rows
    .map((row) => ({ ...row, renewal: renewalState(row.influencer, row.campaigns) }))
    .filter((row) => row.renewal.asked)
    .sort((a, b) => a.renewal.askedAt - b.renewal.askedAt);
}
