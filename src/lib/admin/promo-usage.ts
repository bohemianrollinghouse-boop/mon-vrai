import { codeCampaign } from "@/lib/promos/campaign";
import type { Campaign, Promo } from "@/lib/domain/types";

/*
 * Ce qu'un code promo de partenaire doit à ses campagnes — et ce que le partenaire en
 * voit.
 *
 * Deux questions qu'on ne pouvait poser à cet écran, et qui laissaient des doublons
 * inexplicables. « Pourquoi ce code existe-t-il encore ? » : parce qu'une campagne le
 * porte, ou parce que plus aucune ne le porte et que personne ne l'a effacé. « Le
 * partenaire le voit-il ? » : son espace n'en affiche qu'UN — celui de la campagne qui
 * le fait vivre aujourd'hui —, et les autres existent sans qu'il les voie jamais.
 *
 * Un code que PLUS AUCUNE campagne ne porte est un orphelin : rien ne le recréera, et
 * c'est le seul qu'on puisse effacer sans mentir. Tant qu'une campagne le porte, le
 * supprimer serait sans effet — le prochain enregistrement de cette campagne le
 * réécrirait (voir db/campaigns.syncCampaignPromo) : c'est la campagne qu'il faut
 * changer, pas le reflet.
 *
 * Pur et testé : l'écran et l'action s'en servent tous les deux et doivent répondre la
 * même chose, sans quoi un bouton proposerait ce que l'action refuse.
 */

export type PromoUsage = {
  /** Les campagnes qui portent ce code, la plus récente d'abord. */
  carriers: Campaign[];
  /** Le code que son partenaire voit dans son espace aujourd'hui ; vide s'il n'en voit aucun. */
  shown: string;
  /** Celui-ci est bien celui qu'il voit. */
  visible: boolean;
  /** Plus aucune campagne ne le porte : il ne reviendra pas, on peut l'effacer. */
  orphan: boolean;
};

/** `campaigns` : toutes, sans tri imposé — on s'y retrouve par le code et le partenaire. */
export function promoUsage(promo: Pick<Promo, "code" | "influencerId">, campaigns: Campaign[], now: number): PromoUsage {
  const code = promo.code.toUpperCase();
  const carriers = campaigns.filter((c) => c.code.toUpperCase() === code).sort((a, b) => b.seq - a.seq);
  /* Ce que son espace affiche : la campagne la plus récente dont le code vaut encore. */
  const mine = promo.influencerId ? campaigns.filter((c) => c.influencerId === promo.influencerId).sort((a, b) => b.seq - a.seq) : [];
  const shown = promo.influencerId ? codeCampaign(mine, now)?.code ?? "" : "";
  return { carriers, shown, visible: Boolean(shown) && shown.toUpperCase() === code, orphan: carriers.length === 0 };
}

/** « Camille voit ce code », « Camille voit CAMILLE10 à la place », « Camille n'en voit aucun ». */
export function visibilityLabel(usage: PromoUsage, name: string): string {
  const who = name || "Le partenaire";
  if (usage.visible) return `${who} voit ce code dans son espace.`;
  if (usage.shown) return `${who} ne voit pas celui-ci : c'est ${usage.shown} que son espace affiche.`;
  return `${who} ne voit aucun code : aucune de ses campagnes n'en fait courir aujourd'hui.`;
}
