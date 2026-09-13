/*
 * Le vocabulaire des variables de contrat.
 *
 * Les noms sont en français, et explicites : ils s'écrivent dans un contrat français et
 * se relisent dans une administration française. `{{DELAI_PUBLICATION_EN_JOURS}}` se
 * comprend d'un coup d'œil, pas `{{PUBLICATION_DEADLINE_DAYS}}`.
 *
 * Chaque variable porte aussi un libellé et une explication, montrés dans la fiche du
 * contrat : la personne qui rédige n'a pas à deviner ce qu'attend un nom en capitales.
 */

/** Variables calculées : ni saisies ni saisissables, elles décrivent la réalité du jour. */
export const AUTOMATIC_PLACEHOLDERS = [
  "ADRESSE_MON_VRAI",
  "SIREN_MON_VRAI",
  "REPRESENTANT_MON_VRAI",
  "CREATEUR_PRENOM",
  "CREATEUR_NOM",
  "CREATEUR_ADRESSE",
  "CREATEUR_EMAIL",
  "CREATEUR_PAYS_FISCAL",
  "CREATEUR_QUALITE",
  "CREATEUR_SOCIETE_SIRET",
  "COMPTE_INSTAGRAM",
  "COMPTE_TIKTOK",
  "COMPTE_AUTRE_RESEAU",
  "STATUT_DES_PRODUITS",
  "LISTE_DES_PRODUITS",
  "QUANTITE_DE_PRODUITS",
  "VALEUR_TOTALE_PRODUITS",
  "DATE_ACCEPTATION",
  "VERSION_DU_CONTRAT",
  "REFERENCE_DU_CONTRAT",
] as const;

/*
 * Anciens noms anglais, gardés en équivalence. Un contrat rédigé avant la traduction
 * continue de se remplir correctement, et le nom français prend la main dès qu'il est
 * présent. À retirer quand plus aucun contrat n'utilisera les anciens.
 */
export const LEGACY_NAMES: Record<string, string> = {
  MONVRAI_ADDRESS: "ADRESSE_MON_VRAI",
  MONVRAI_SIREN: "SIREN_MON_VRAI",
  MONVRAI_REPRESENTATIVE: "REPRESENTANT_MON_VRAI",
  CREATOR_FIRST_NAME: "CREATEUR_PRENOM",
  CREATOR_LAST_NAME: "CREATEUR_NOM",
  CREATOR_ADDRESS: "CREATEUR_ADRESSE",
  CREATOR_EMAIL: "CREATEUR_EMAIL",
  CREATOR_TAX_COUNTRY: "CREATEUR_PAYS_FISCAL",
  CREATOR_STATUS: "CREATEUR_QUALITE",
  CREATOR_COMPANY_DETAILS: "CREATEUR_SOCIETE_SIRET",
  INSTAGRAM_ACCOUNT: "COMPTE_INSTAGRAM",
  TIKTOK_ACCOUNT: "COMPTE_TIKTOK",
  OTHER_SOCIAL_ACCOUNT: "COMPTE_AUTRE_RESEAU",
  PRODUCT_STATUS: "STATUT_DES_PRODUITS",
  PRODUCTS_LIST: "LISTE_DES_PRODUITS",
  PRODUCTS_QUANTITY: "QUANTITE_DE_PRODUITS",
  PRODUCTS_TOTAL_VALUE: "VALEUR_TOTALE_PRODUITS",
  CONTRACT_ACCEPTED_AT: "DATE_ACCEPTATION",
  CONTRACT_VERSION: "VERSION_DU_CONTRAT",
  CONTRACT_ID: "REFERENCE_DU_CONTRAT",
  DELIVERY_DEADLINE_DAYS: "DELAI_EN_JOURS",
  CONTENT_DUE_DATE: "DATE_REMISE_CONTENUS",
  PRODUCT_STATUS_NOTE: "NOTES_PROTOTYPES",
  PROTOTYPE_NOTES: "NOTES_PROTOTYPES",
  PAID_ADS_AUTHORIZATION: "AUTORISATION_PUBLICITE_PAYANTE",
  PUBLICATION_PLATFORMS: "PLATEFORMES_DE_PUBLICATION",
  PUBLICATION_DEADLINE_DAYS: "DELAI_PUBLICATION_EN_JOURS",
  CAMPAIGN_END_DATE: "DATE_FIN_DE_CAMPAGNE",
  ADDITIONAL_USAGE_RIGHTS: "DROITS_SUPPLEMENTAIRES",
  STATS_DELIVERY_DELAY: "DELAI_ENVOI_STATISTIQUES",
  EXCLUSIVITY_TERMS: "CONDITIONS_EXCLUSIVITE",
  OPTIONAL_UGC_QUANTITY: "QUANTITE_UGC_CONVENUE",
  INFLUENCE_ADDITIONAL_RIGHTS: "DROITS_SUPPLEMENTAIRES_INFLUENCE",
};

export type VariableHelp = { label: string; hint: string; example?: string };

/* Ce que chaque variable veut dire, en clair. Montré dans la fiche du contrat. */
export const VARIABLE_HELP: Record<string, VariableHelp> = {
  /* ---------- Calculées ---------- */
  ADRESSE_MON_VRAI: { label: "Adresse de Mon Vrai", hint: "Prise dans Paramètres → Mentions légales." },
  SIREN_MON_VRAI: { label: "SIREN de Mon Vrai", hint: "Pris dans Paramètres → Mentions légales." },
  REPRESENTANT_MON_VRAI: { label: "Représentant de Mon Vrai", hint: "Pris dans Paramètres → Mentions légales." },
  CREATEUR_PRENOM: { label: "Prénom du créateur", hint: "Saisi par le partenaire au moment de signer." },
  CREATEUR_NOM: { label: "Nom du créateur", hint: "Saisi par le partenaire au moment de signer." },
  CREATEUR_ADRESSE: { label: "Adresse du créateur", hint: "Son adresse de contractant, pas celle de livraison." },
  CREATEUR_EMAIL: { label: "E-mail du créateur", hint: "Celui de sa fiche partenaire." },
  CREATEUR_PAYS_FISCAL: { label: "Pays de résidence fiscale", hint: "Déclaré par le partenaire à la signature." },
  CREATEUR_QUALITE: { label: "Qualité du créateur", hint: "Particulier, micro-entrepreneur ou société — déclaré à la signature." },
  CREATEUR_SOCIETE_SIRET: { label: "Société et SIRET du créateur", hint: "Vide pour un particulier : la ligne disparaît alors du contrat." },
  COMPTE_INSTAGRAM: { label: "Compte Instagram", hint: "Renseigné par le partenaire dans son espace." },
  COMPTE_TIKTOK: { label: "Compte TikTok", hint: "Renseigné par le partenaire dans son espace." },
  COMPTE_AUTRE_RESEAU: { label: "Autre compte", hint: "Facebook, renseigné par le partenaire dans son espace." },
  STATUT_DES_PRODUITS: { label: "Statut des produits", hint: "Prototypes ou exemplaires définitifs — d'après la case du kit, sur la fiche du partenaire." },
  LISTE_DES_PRODUITS: { label: "Liste des livres offerts", hint: "Titres, quantités et valeurs, repris du kit." },
  QUANTITE_DE_PRODUITS: { label: "Nombre d'exemplaires", hint: "Somme des quantités du kit." },
  VALEUR_TOTALE_PRODUITS: { label: "Valeur totale", hint: "En euros, sans le symbole — le contrat l'écrit lui-même." },
  DATE_ACCEPTATION: { label: "Date d'acceptation", hint: "Horodatée au moment où le partenaire valide." },
  VERSION_DU_CONTRAT: { label: "Version du contrat", hint: "Celle de cette fiche." },
  REFERENCE_DU_CONTRAT: { label: "Référence du contrat", hint: "Identifiant de cette fiche." },

  /* ---------- À remplir ---------- */
  DELAI_EN_JOURS: { label: "Délai de remise des contenus", hint: "En jours après réception des produits. Un nombre seul : le contrat écrit « jours » ensuite.", example: "30" },
  DATE_REMISE_CONTENUS: {
    label: "Date indicative de remise",
    hint: "Laissez vide : elle se calcule à la signature, depuis le délai ci-dessus. Ne remplissez que pour imposer une date fixe.",
    example: "calculée depuis le délai",
  },
  NOTES_PROTOTYPES: { label: "Précisions sur les prototypes", hint: "Ce qu'il faut signaler au créateur : coquilles connues, différences prévues…", example: "Aucune information particulière." },
  AUTORISATION_PUBLICITE_PAYANTE: { label: "Publicité payante", hint: "Ce qui est autorisé, ou non, en publicité payante (Meta Ads, TikTok Ads…).", example: "Non comprise." },
  PLATEFORMES_DE_PUBLICATION: { label: "Plateformes de publication", hint: "Où les contenus seront publiés.", example: "Instagram et TikTok" },
  DELAI_PUBLICATION_EN_JOURS: { label: "Délai de publication", hint: "En jours après réception des produits. Un nombre seul.", example: "30" },
  DATE_FIN_DE_CAMPAGNE: {
    label: "Fin de campagne",
    hint: "Laissez vide : elle se calcule à la signature, depuis le délai de publication. Ne remplissez que pour imposer une date fixe.",
    example: "calculée depuis le délai",
  },
  DROITS_SUPPLEMENTAIRES: { label: "Droits d'usage supplémentaires", hint: "Au-delà du repartage : catalogue, revendeurs, publicité…", example: "Aucun droit supplémentaire accordé." },
  DELAI_ENVOI_STATISTIQUES: { label: "Délai d'envoi des statistiques", hint: "Sous quel délai le créateur transmet vues et interactions.", example: "15 jours après la publication" },
  CONDITIONS_EXCLUSIVITE: { label: "Exclusivité", hint: "« Aucune », ou les conditions convenues.", example: "Aucune" },
  QUANTITE_UGC_CONVENUE: { label: "Quantité d'UGC convenue", hint: "S'il a été convenu un nombre précis de photos ou vidéos.", example: "Aucune quantité minimale convenue." },
  DROITS_SUPPLEMENTAIRES_INFLUENCE: { label: "Droits supplémentaires — partie Influence", hint: "Au-delà du repartage organique pendant 12 mois.", example: "Aucun droit supplémentaire accordé." },
};

/** Le libellé d'une variable, ou son nom brut si elle n'est pas au dictionnaire. */
export const variableLabel = (key: string): string => VARIABLE_HELP[key]?.label ?? key;
