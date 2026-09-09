/*
 * Offres Boxtal utiles à une petite boutique française : code d'offre (pour créer
 * l'étiquette), et, pour les livraisons en point relais, le réseau à afficher sur la
 * carte. Liste complète : developer.boxtal.com → « codes d'offres de transport ».
 */
export type BoxtalOffer = { code: string; label: string; carrier: string; relay: boolean; networks: string[]; europe?: boolean };

export const BOXTAL_OFFERS: BoxtalOffer[] = [
  { code: "MONR-CpourToi", label: "Mondial Relay - point relais (France)", carrier: "Mondial Relay", relay: true, networks: ["MONR_NETWORK"] },
  { code: "MONR-CpourToiEurope", label: "Mondial Relay - point relais (Europe)", carrier: "Mondial Relay", relay: true, networks: ["MONR_NETWORK"], europe: true },
  { code: "MONR-DomicileFrance", label: "Mondial Relay - domicile (France)", carrier: "Mondial Relay", relay: false, networks: [] },
  { code: "POFR-ColissimoAccess", label: "Colissimo - domicile sans signature", carrier: "Colissimo", relay: false, networks: [] },
  { code: "POFR-ColissimoExpert", label: "Colissimo - domicile avec signature", carrier: "Colissimo", relay: false, networks: [] },
  { code: "POFR-ColissimoPickupStation", label: "Colissimo - point retrait", carrier: "Colissimo", relay: true, networks: ["POFR_NETWORK"] },
  { code: "POFR-ColissimoAccessInternational", label: "Colissimo - international domicile", carrier: "Colissimo", relay: false, networks: [], europe: true },
  { code: "LPFR-LettreSuivieNational", label: "La Poste - Lettre verte suivie", carrier: "La Poste", relay: false, networks: [] },
  { code: "CHRP-Chrono13", label: "Chronopost - Chrono 13 (domicile J+1)", carrier: "Chronopost", relay: false, networks: [] },
  { code: "CHRP-Chrono18", label: "Chronopost - Chrono 18", carrier: "Chronopost", relay: false, networks: [] },
  { code: "CHRP-ChronoRelais", label: "Chronopost - Chrono Relais 13", carrier: "Chronopost", relay: true, networks: ["CHRP_NETWORK"] },
  { code: "CHRP-ChronoShoptoShop", label: "Chronopost - Shop2Shop", carrier: "Chronopost", relay: true, networks: ["CHRP_SHOP_ONLY_NETWORK"] },
  { code: "CHRP-ChronoRelaisEurope", label: "Chronopost - Relais Europe", carrier: "Chronopost", relay: true, networks: ["CHRP_NETWORK"], europe: true },
  { code: "SOGP-RelaisColis", label: "Relais Colis", carrier: "Relais Colis", relay: true, networks: ["SOGP_NETWORK"] },
  { code: "COPR-CoprRelaisDomicileNat", label: "Colis Privé - domicile", carrier: "Colis Privé", relay: false, networks: [] },
  { code: "UPSE-Standard", label: "UPS Standard", carrier: "UPS", relay: false, networks: [], europe: true },
  { code: "UPSE-StandardAP", label: "UPS Standard - Access Point", carrier: "UPS", relay: true, networks: ["UPSE_NETWORK"], europe: true },
];

export function findOffer(code: string): BoxtalOffer | undefined {
  return BOXTAL_OFFERS.find((o) => o.code === code);
}

/** Libellé du transporteur pour une offre, ex. « Colissimo ». */
export function carrierOf(code: string): string {
  return findOffer(code)?.carrier ?? code.split("-")[0] ?? code;
}
