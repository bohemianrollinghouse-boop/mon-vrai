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
  "DATE_DEBUT_CAMPAGNE",
  "DATE_FIN_DE_CAMPAGNE",
  "CONTENUS_ATTENDUS",
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
  CAMPAIGN_START_DATE: "DATE_DEBUT_CAMPAGNE",
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
  DATE_DEBUT_CAMPAGNE: { label: "Début de la campagne", hint: "Pris sur la fiche de la campagne, où se règlent aussi le code promo et sa remise." },
  DATE_FIN_DE_CAMPAGNE: { label: "Fin de la campagne", hint: "Prise sur la fiche de la campagne. Passée cette date, le code promo ne remise plus rien." },
  CONTENUS_ATTENDUS: {
    label: "Contenus attendus",
    hint: "« 5 photos et 2 vidéos », pris sur la fiche de la campagne — là où le décompte des fichiers reçus se fait. Rien d'attendu : la rubrique disparaît du contrat.",
  },
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
  DROITS_SUPPLEMENTAIRES: { label: "Droits d'usage supplémentaires", hint: "Au-delà du repartage : catalogue, revendeurs, publicité…", example: "Aucun droit supplémentaire accordé." },
  DELAI_ENVOI_STATISTIQUES: { label: "Délai d'envoi des statistiques", hint: "Sous quel délai le créateur transmet vues et interactions.", example: "15 jours après la publication" },
  CONDITIONS_EXCLUSIVITE: { label: "Exclusivité", hint: "« Aucune », ou les conditions convenues.", example: "Aucune" },
  QUANTITE_UGC_CONVENUE: { label: "Quantité d'UGC convenue", hint: "S'il a été convenu un nombre précis de photos ou vidéos.", example: "Aucune quantité minimale convenue." },
  DROITS_SUPPLEMENTAIRES_INFLUENCE: { label: "Droits supplémentaires — partie Influence", hint: "Au-delà du repartage organique pendant 12 mois.", example: "Aucun droit supplémentaire accordé." },

  /* ---------- Ce que les contenus doivent être, et par où ils arrivent ---------- */
  BRIEF_VISUEL: { label: "Brief visuel annexé", hint: "Nom et date du PDF accepté avant l'envoi des livres. C'est lui qui fait foi sur la qualité attendue.", example: "Brief Mon Vrai — automne 2026 (PDF, 12 pages)" },
  FORMATS_PHOTO: { label: "Formats des photos", hint: "Extension, définition minimale, orientation. Sans filigrane, c'est écrit dans le contrat.", example: "JPEG, 4000 px minimum sur le grand côté, vertical de préférence" },
  FORMATS_VIDEO: { label: "Formats des vidéos", hint: "Extension, définition, cadence. Qualité d'origine, sans texte ni musique : c'est écrit dans le contrat.", example: "MP4 ou MOV, 1080 × 1920, 25 ou 30 images par seconde" },
  DUREE_DES_RUSHS: { label: "Durée des rushs", hint: "Combien de temps doit durer chaque plan remis.", example: "10 secondes minimum par rush" },
  MODE_DE_TRANSMISSION: { label: "Mode de transmission", hint: "Par où les fichiers arrivent.", example: "Dépôt dans l'espace partenaire monvrai.fr" },
  DELAI_DE_VALIDATION: { label: "Délai de validation", hint: "Sous quel délai Mon Vrai dit si les contenus sont conformes au brief.", example: "10 jours ouvrés" },

  /* ---------- Ce que la marque peut en faire ---------- */
  SUPPORTS_AUTORISES: { label: "Supports autorisés", hint: "Où les contenus pourront paraître. Énumérez : ce qui n'est pas listé n'est pas cédé.", example: "Site monvrai.fr, comptes sociaux de la marque, infolettre, fiches produit des revendeurs" },
  DUREE_DES_DROITS: { label: "Durée des droits", hint: "À compter de la remise. Une durée, jamais « illimitée ».", example: "24 mois à compter de la remise" },
  TERRITOIRE_DES_DROITS: { label: "Territoire", hint: "Où les contenus pourront être diffusés.", example: "France et Union européenne" },
  CREDIT_DU_CREATEUR: { label: "Crédit du créateur", hint: "Sous quelle forme il est cité, et sur quels supports.", example: "@pseudo, lorsque le support le permet" },
  OPTION_SANS_VISAGE: { label: "Option sans visage", hint: "« Oui » : aucun visage reconnaissable dans les contenus, et aucune autorisation à produire.", example: "Non" },

  /* ---------- Ce qui paraît chez le créateur (contrat influence) ---------- */
  FORMAT_DE_LA_PUBLICATION: { label: "Format de la publication Instagram", hint: "Choisi et inscrit AVANT signature : photo, carrousel ou Reel.", example: "Reel" },
  DATE_DE_LA_PUBLICATION: { label: "Date de la publication", hint: "Convenue avant signature.", example: "au plus tard le 30 novembre 2026" },
  DATES_DES_PRISES_DE_PAROLE: { label: "Dates des quatre prises de parole", hint: "Quatre dates distinctes réparties sur deux mois, acceptées ensemble.", example: "12 nov., 26 nov., 10 déc., 23 déc. 2026" },
  NOMBRE_ECRANS_PAR_PRISE_DE_PAROLE: { label: "Écrans par prise de parole", hint: "Une prise de parole n'est pas un écran : dites combien d'écrans elle compte au minimum.", example: "2 écrans minimum" },
  DUREE_MAINTIEN_STORY_A_LA_UNE: { label: "Maintien de la story à la une", hint: "Combien de temps elle doit rester accessible sur le profil. Une durée, pas « si possible ».", example: "6 mois" },
  DATE_LIMITE_STORY_A_LA_UNE: { label: "Date limite d'ajout à la une", hint: "Au plus tard quand la story à la une doit être en ligne.", example: "48 heures après la première prise de parole" },
  DELAI_REMISE_FICHIERS: { label: "Délai de remise des fichiers", hint: "Après chaque publication ou prise de parole, sous quel délai les originaux et les rushs arrivent.", example: "7 jours" },
};

/** Le libellé d'une variable, ou son nom brut si elle n'est pas au dictionnaire. */
export const variableLabel = (key: string): string => VARIABLE_HELP[key]?.label ?? key;
