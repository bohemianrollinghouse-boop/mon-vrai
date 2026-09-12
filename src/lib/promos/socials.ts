import type { Influencer, PartnerSocials } from "@/lib/domain/types";

/*
 * Le compte principal d'un partenaire, déduit de ses réseaux.
 *
 * La fiche ne demande plus « plateforme » ni « pseudo » : ces deux champs doublonnaient
 * les réseaux, qui portent la même information en mieux — un pseudo ET une adresse, par
 * plateforme, et tenus par le partenaire lui-même. Ce qui a été saisi avant reste lu,
 * en repli, pour que les fiches anciennes continuent de s'afficher comme avant.
 *
 * L'ordre est celui de l'usage : Instagram, puis TikTok, puis Facebook.
 */

export type MainAccount = { platform: string; handle: string; url: string };

const ORDER = [
  ["Instagram", "instagram"],
  ["TikTok", "tiktok"],
  ["Facebook", "facebook"],
] as const;

export function mainAccount(inf: Pick<Influencer, "socials" | "handle" | "platform" | "slug">): MainAccount {
  for (const [label, key] of ORDER) {
    const account = inf.socials[key as keyof PartnerSocials];
    if (account.handle || account.url) return { platform: label, handle: account.handle || account.url, url: account.url };
  }
  // Repli sur les anciens champs, puis sur l'identifiant du lien : jamais rien de vide.
  return { platform: inf.platform, handle: inf.handle || inf.slug, url: "" };
}

/** Combien de plateformes renseignées : utile pour dire « et 2 autres ». */
export function socialCount(socials: PartnerSocials): number {
  return ORDER.filter(([, key]) => {
    const a = socials[key as keyof PartnerSocials];
    return Boolean(a.handle || a.url);
  }).length;
}
