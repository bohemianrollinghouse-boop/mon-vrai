import { EMPTY_GUIDE, type CollaborationType, type ContentQuota } from "@/lib/domain/types";

/*
 * Les contrats RÉDIGÉS, prêts à installer.
 *
 * Même raison d'être que `blocks/editorial-pages.ts` : poser un contenu écrit à la main
 * en production sans ligne de commande ni clé de compte de service. Un bouton de
 * /admin/contrats les crée ; une fois créés, c'est la base qui fait foi et ce fichier ne
 * les rattrape plus — un contrat signé ne se réécrit jamais derrière son signataire.
 *
 * L'installation est donc idempotente par la VERSION : un contrat déjà présent sous la
 * même version n'est pas touché. Pour corriger un texte, on publie une version suivante
 * (« Partir de celui-ci pour une nouvelle version », dans l'écran des contrats).
 *
 * Les valeurs de variables ci-dessous sont des points de départ raisonnables, pas des
 * engagements : elles se relisent sur la fiche du contrat avant la première signature.
 */

export type ContractDraft = {
  name: string;
  type: CollaborationType;
  version: string;
  summary: string;
  body: string;
  expected: ContentQuota;
  publications: { label: string; qty: number; options: string[] }[];
  variables: Record<string, string>;
};

export const CONTRACT_DRAFTS: ContractDraft[] = [
  {
    name: "Création de contenu Mon Vrai",
    type: "UGC",
    version: "UGC-2026-10-v1",
    expected: { photos: 20, videos: 10 },
    /* Rien à publier : ce contrat n'exige aucune parution. */
    publications: [],
    variables: {
      DELAI_EN_JOURS: "30",
      DELAI_DE_VALIDATION: "10 jours ouvrés",
      BRIEF_VISUEL: "Kit de création de contenu Mon Vrai",
      FORMATS_PHOTO: "JPEG, 4000 px minimum sur le grand côté, vertical de préférence",
      FORMATS_VIDEO: "MP4 ou MOV, 1080 × 1920, 25 ou 30 images par seconde",
      DUREE_DES_RUSHS: "entre 10 et 15 secondes par vidéo",
      MODE_DE_TRANSMISSION: "Dépôt dans votre espace partenaire sur monvrai.fr",
      SUPPORTS_AUTORISES: "le site monvrai.fr, les comptes sociaux de la marque, l'infolettre et les fiches produit des revendeurs",
      AUTORISATION_PUBLICITE_PAYANTE: "Non comprise. Toute utilisation publicitaire fera l'objet d'un accord complémentaire entre les Parties.",
      DUREE_DES_DROITS: "24 mois à compter de la remise des contenus",
      TERRITOIRE_DES_DROITS: "France et Union européenne",
      CREDIT_DU_CREATEUR: "par son pseudonyme, lorsque le support le permet",
      OPTION_SANS_VISAGE: "Non",
      NOTES_PROTOTYPES: "Aucune information particulière.",
      DROITS_SUPPLEMENTAIRES: "Aucun droit supplémentaire accordé.",
      CONDITIONS_EXCLUSIVITE: "Aucune",
    },
    summary: `En échange des imagiers Mon Vrai qui vous sont offerts, vous vous engagez à nous transmettre **20 photographies originales** et **10 vidéos originales de 10 à 15 secondes**, montrant les imagiers réellement utilisés, manipulés ou intégrés dans le quotidien.

Les photographies sont livrées en haute résolution, **sans filigrane**. Les vidéos et les rushs sont livrés en **qualité d'origine, sans texte, sans musique et sans filtre**.

Un **kit de création de contenu** vous est remis avec ce contrat : il dit ce que nous attendons en matière de lumière, de cadrage et de netteté, et distingue nettement ce qui nous engage de ce qui n'est qu'inspiration.

**Rien à publier sur vos comptes : ces contenus sont destinés à la marque.**

Vos contenus restent les vôtres. Vous nous accordez un droit d'usage délimité — supports, durée, territoire —, et non une cession de tous vos droits.`,
    body: `# CONTRAT DE CRÉATION DE CONTENU : MON VRAI

Référence **{{REFERENCE_DU_CONTRAT}}** — version **{{VERSION_DU_CONTRAT}}**

## Article 1 : Les parties

Le présent contrat est conclu entre :

**Bohemian Rolling House (Mon Vrai)**, micro-entreprise exploitant la marque Mon Vrai, dont le siège est situé à **{{ADRESSE_MON_VRAI}}**, immatriculée sous le numéro **{{SIREN_MON_VRAI}}**, représentée par **{{REPRESENTANT_MON_VRAI}}**, résidente fiscale en France,

ci-après « Mon Vrai »,

et

**{{CREATEUR_PRENOM}} {{CREATEUR_NOM}}**, {{CREATEUR_QUALITE}}, demeurant **{{CREATEUR_ADRESSE}}**, joignable à **{{CREATEUR_EMAIL}}**, résident fiscal de **{{CREATEUR_PAYS_FISCAL}}**, {{CREATEUR_SOCIETE_SIRET}},

ci-après « le Créateur »,

ensemble « les Parties ».

## Article 2 : Objet

Le Créateur réalise, pour le compte de Mon Vrai, des photographies et des vidéos mettant en scène les imagiers Mon Vrai, et les lui remet.

Le présent contrat ne comporte **aucun engagement de publication** sur les comptes du Créateur, ni aucune obligation de parler de la marque à son audience. Il ne relève donc pas de l'activité d'influence commerciale définie à l'article 1er de la loi n° 2023-451 du 9 juin 2023.

## Article 3 : Contrepartie

En contrepartie, Mon Vrai remet au Créateur, à titre définitif et sans obligation de restitution :

{{LISTE_DES_PRODUITS}}

soit **{{QUANTITE_DE_PRODUITS}} exemplaires**, d'une valeur commerciale totale de **{{VALEUR_TOTALE_PRODUITS}} €**.

{{STATUT_DES_PRODUITS}}

{{NOTES_PROTOTYPES}}

Aucune somme d'argent n'est versée au titre du présent contrat. Le Créateur fait son affaire des conséquences fiscales et sociales de cet avantage en nature au regard de sa situation personnelle, et déclare être en mesure de contracter à ce titre.

## Article 4 : Kit de création de contenu

Un kit de création de contenu au format PDF, référencé **{{BRIEF_VISUEL}}**, est annexé au présent contrat. Il est accessible au Créateur au moment de l'acceptation et demeure disponible depuis son espace partenaire pendant toute la durée du contrat. Le Créateur en prend connaissance **avant** d'accepter, et avant l'envoi des livres.

Ce document distingue expressément deux registres :

* les **exigences**, qui engagent le Créateur : lumière, cadrage, netteté, propreté du décor, définition des fichiers ;
* les **inspirations**, qui ne l'engagent pas : exemples, ambiances, références, propositions de mise en scène.

Un contenu ne peut être refusé que sur le fondement d'une exigence écrite au kit accepté. Une inspiration non suivie n'est jamais un motif de refus.

## Article 5 : Contenus à remettre

Le Créateur s'engage à transmettre à Mon Vrai {{CONTENUS_ATTENDUS}}.

Les contenus mettent en scène de manière naturelle les imagiers Mon Vrai réellement utilisés, manipulés ou intégrés dans le quotidien. Ils peuvent montrer les livres manipulés, leurs pages, les mains d'un enfant, un moment parent-enfant, les livres dans un environnement quotidien, ou le rapprochement entre une représentation de l'imagier et l'élément réel correspondant.

Plusieurs photographies ou vidéos peuvent être issues d'une même situation ou d'une même séance.

## Article 6 : Caractéristiques techniques

**Photographies** : {{FORMATS_PHOTO}}. Elles sont livrées en haute résolution, dans leur qualité d'origine, **sans filigrane**, sans logo, sans recadrage destructif et sans retouche altérant les couleurs réelles des livres.

**Vidéos et rushs** : {{FORMATS_VIDEO}}, {{DUREE_DES_RUSHS}}. Ils sont livrés dans leur **qualité d'origine**, sans texte incrusté, sans musique, sans filtre et sans habillage. Les rushs correspondent aux contenus convenus : ils ne sont pas une sélection de chutes.

Les fichiers sont nommés de façon à être identifiables et transmis par : **{{MODE_DE_TRANSMISSION}}**.

## Article 7 : Délais

Les livres sont expédiés à compter du **{{DATE_DEBUT_CAMPAGNE}}**.

Les contenus sont remis au plus tard le **{{DATE_REMISE_CONTENUS}}**, soit **{{DELAI_EN_JOURS}} jours** après la réception des livres.

Si le Créateur rencontre un empêchement, il en informe Mon Vrai avant l'échéance. Les Parties conviennent alors d'une nouvelle date par écrit, par simple échange de courriels.

## Article 8 : Validation et corrections

Mon Vrai dispose de **{{DELAI_DE_VALIDATION}}** à compter de la remise pour faire part de ses observations. Passé ce délai sans réponse, les contenus sont réputés acceptés.

Si un contenu ne respecte pas une exigence du kit accepté, Mon Vrai le signale en indiquant précisément l'exigence en cause. Le Créateur dispose alors d'un délai raisonnable, et au minimum de sept jours, pour reprendre le contenu concerné. Cette reprise est limitée à **une série de corrections par contenu**.

Aucune correction ne peut être demandée pour imposer un style, une mise en scène ou un angle qui ne figuraient pas au kit accepté.

## Article 9 : Droits d'utilisation

**9.1 — Droits concédés.** Le Créateur concède à Mon Vrai, sur les contenus remis et acceptés, le droit de les reproduire, de les représenter et de les adapter dans les conditions délimitées ci-après. Chacun de ces droits est concédé distinctement ; **tout droit non mentionné au présent article n'est pas concédé**.

**9.2 — Supports.** Les contenus peuvent être utilisés sur les supports suivants, à l'exclusion de tout autre : {{SUPPORTS_AUTORISES}}.

**9.3 — Usage organique et usage publicitaire.** L'usage organique — publications non payantes de Mon Vrai sur ses propres supports — est compris. L'usage publicitaire payant, notamment en achat d'espace sur les réseaux sociaux ou en display, est encadré comme suit : {{AUTORISATION_PUBLICITE_PAYANTE}}

**9.4 — Durée.** {{DUREE_DES_DROITS}}. Au terme de cette durée, Mon Vrai cesse toute nouvelle diffusion. Les supports imprimés déjà produits et les publications déjà en ligne avant le terme peuvent demeurer en l'état.

**9.5 — Territoire.** {{TERRITOIRE_DES_DROITS}}.

**9.6 — Recadrage et montage.** Mon Vrai peut recadrer, raccourcir, assembler les contenus entre eux, y ajouter un texte, une musique ou son identité visuelle, dès lors que l'intervention ne dénature pas le contenu et ne lui fait pas dire autre chose que ce qu'il montre.

**9.7 — Crédit.** Le Créateur est crédité ainsi : {{CREDIT_DU_CREATEUR}}. Le droit moral du Créateur sur ses contenus est inaliénable et lui reste acquis.

**9.8 — Droits supplémentaires.** {{DROITS_SUPPLEMENTAIRES}}

**9.9 — Ce qui n'est pas concédé.** La revente des contenus, leur cession à un tiers autre qu'un prestataire agissant pour le compte de Mon Vrai, leur dépôt à titre de marque et leur usage par une autre entreprise ne sont pas concédés.

## Article 10 : Garanties du Créateur

Le Créateur garantit qu'il est l'auteur des contenus remis, qu'il détient l'ensemble des droits nécessaires à la présente concession, et que les contenus ne reproduisent aucune œuvre, marque, musique ou élément de décor protégé appartenant à un tiers sans autorisation.

## Article 11 : Personnes reconnaissables et enfants

**Option sans visage : {{OPTION_SANS_VISAGE}}.** Lorsque cette option est retenue, aucun visage reconnaissable ne figure dans les contenus et le présent article ne s'applique pas. Les contenus peuvent alors être réalisés avec uniquement les mains, le corps de dos, un cadrage excluant le visage, ou sans présence d'un enfant.

À défaut, le Créateur recueille et remet à Mon Vrai, avant la livraison des contenus, une autorisation écrite de droit à l'image pour chaque personne reconnaissable, conforme au modèle annexé. Cette autorisation porte sur les mêmes supports, la même durée et le même territoire que l'article 9.

Lorsqu'un enfant mineur est reconnaissable, l'autorisation est donnée par les **deux titulaires de l'autorité parentale**, et l'enfant est associé à la décision selon son âge et son degré de maturité. À défaut d'autorisation des deux parents, le contenu n'est pas livré.

Mon Vrai s'interdit toute utilisation d'un contenu représentant un enfant qui ne correspondrait pas à l'autorisation donnée. Toute autorisation peut être retirée pour l'avenir, par écrit ; Mon Vrai cesse alors la diffusion du contenu concerné dans un délai raisonnable.

## Article 12 : Données personnelles

Les images de personnes reconnaissables constituent des données à caractère personnel. Mon Vrai les traite pour les seules finalités du présent contrat, pendant la durée prévue à l'article 9.4, et répond des demandes d'accès, de rectification et d'effacement adressées à **[adresse de contact à compléter]**.

## Article 13 : Sincérité

Mon Vrai n'impose au Créateur aucun avis, aucune formule élogieuse et aucune affirmation sur les livres. Les contenus doivent rester fidèles à ce que le Créateur a réellement constaté. Aucune allégation relative à la santé, à l'éveil ou au développement de l'enfant ne peut être demandée ni suggérée.

## Article 14 : Absence de publication

Le Créateur n'est soumis à aucune obligation de publier les contenus sur ses comptes personnels.

S'il décide spontanément de présenter les produits sur ses réseaux sociaux, il lui appartient de respecter les obligations légales applicables à cette publication, notamment l'indication claire du caractère commercial lorsqu'elle est requise.

## Article 15 : Absence d'exclusivité

Le présent contrat ne comporte aucune exclusivité. Le Créateur reste libre de travailler avec d'autres entreprises, marques ou éditeurs.

## Article 16 : Retard, non-livraison, non-conformité

En cas de retard, Mon Vrai adresse au Créateur un rappel par courriel, puis une mise en demeure lui laissant un délai de **quinze jours**.

Si, à l'issue de ce délai, aucun contenu n'a été remis, le contrat est résolu de plein droit. Le Créateur restitue alors les livres, à ses frais s'ils sont encore en état d'être réexpédiés, ou rembourse leur valeur telle qu'indiquée à l'article 3. Les livres ouverts ou abîmés de bonne foi ne font l'objet d'aucune demande.

Si les contenus ont été partiellement remis, la restitution est proportionnelle à ce qui manque, et Mon Vrai conserve les droits concédés sur ce qui a été livré et accepté.

**Aucune pénalité forfaitaire n'est due.** Aucune des Parties n'est tenue d'un dommage imprévisible ou étranger à l'exécution du présent contrat.

## Article 17 : Indépendance des Parties

Le Créateur organise librement son travail, choisit ses moyens et n'est soumis à aucun pouvoir de direction, de contrôle ou de sanction de Mon Vrai. Le présent contrat ne crée ni contrat de travail, ni mandat, ni société entre les Parties.

## Article 18 : Confidentialité

Le kit de création de contenu, les échanges préparatoires et, le cas échéant, les ouvrages non encore commercialisés sont confidentiels jusqu'à leur mise en vente publique.

## Article 19 : Durée et résiliation

Le contrat prend effet à son acceptation et s'achève à la remise et à la validation des contenus, sans préjudice de l'article 9 qui survit pour la durée qui y est prévue.

Chaque Partie peut y mettre fin avant l'expédition des livres, par écrit et sans indemnité.

## Article 20 : Droit applicable

Le présent contrat est soumis au droit français, notamment au code de la consommation, au code de la propriété intellectuelle et à la loi n° 2023-451 du 9 juin 2023.

Les Parties rechercheront une solution amiable avant toute action. Lorsque le Créateur contracte en dehors de toute activité professionnelle, il peut recourir gratuitement à un médiateur de la consommation : **[médiateur et coordonnées à compléter]**.

## Acceptation

Accepté par voie électronique le **{{DATE_ACCEPTATION}}** par **{{CREATEUR_PRENOM}} {{CREATEUR_NOM}}**, sous la référence **{{REFERENCE_DU_CONTRAT}}**.`,
  },
  {
    name: "Collaboration Instagram Mon Vrai",
    type: "INFLUENCE",
    version: "INFLUENCE-2026-10-v1",
    expected: { photos: 20, videos: 10 },
    /* Ce qui doit PARAÎTRE, déplié en cases à cocher sur chaque campagne. */
    publications: [
      { label: "Publication Instagram", qty: 1, options: [] },
      { label: "Prise de parole en story", qty: 4, options: [] },
      { label: "Story à la une", qty: 1, options: [] },
    ],
    variables: {
      DELAI_EN_JOURS: "30",
      DELAI_DE_VALIDATION: "10 jours ouvrés",
      BRIEF_VISUEL: "Kit de création de contenu Mon Vrai",
      FORMATS_PHOTO: "JPEG, 4000 px minimum sur le grand côté, vertical de préférence",
      FORMATS_VIDEO: "MP4 ou MOV, 1080 × 1920, 25 ou 30 images par seconde",
      DUREE_DES_RUSHS: "entre 10 et 15 secondes par vidéo",
      MODE_DE_TRANSMISSION: "Dépôt dans votre espace partenaire sur monvrai.fr",
      SUPPORTS_AUTORISES: "le site monvrai.fr, les comptes sociaux de la marque, l'infolettre et les fiches produit des revendeurs",
      AUTORISATION_PUBLICITE_PAYANTE: "Non comprise. Toute utilisation publicitaire fera l'objet d'un accord complémentaire entre les Parties.",
      DUREE_DES_DROITS: "24 mois à compter de la remise des contenus",
      TERRITOIRE_DES_DROITS: "France et Union européenne",
      CREDIT_DU_CREATEUR: "par son pseudonyme, lorsque le support le permet",
      OPTION_SANS_VISAGE: "Non",
      NOTES_PROTOTYPES: "Aucune information particulière.",
      DELAI_REMISE_FICHIERS: "7 jours",
      DELAI_ENVOI_STATISTIQUES: "15 jours après chaque parution",
      NOMBRE_ECRANS_PAR_PRISE_DE_PAROLE: "2 écrans",
      DATE_LIMITE_STORY_A_LA_UNE: "48 heures après la première prise de parole",
      DUREE_MAINTIEN_STORY_A_LA_UNE: "6 mois",
      DROITS_SUPPLEMENTAIRES_INFLUENCE: "Aucun droit supplémentaire accordé.",
      CONDITIONS_EXCLUSIVITE: "Aucune",
    },
    summary: `En échange des imagiers Mon Vrai qui vous sont offerts, vous vous engagez à :

* publier **une publication Instagram** au format **{{FORMAT_DE_LA_PUBLICATION}}**, choisi avec nous avant la signature ;
* prendre la parole **quatre fois en story**, à quatre dates différentes réparties sur deux mois ;
* ajouter une **story à la une** présentant les livres et votre code promotionnel, maintenue **{{DUREE_MAINTIEN_STORY_A_LA_UNE}}** sur votre profil ;
* nous transmettre {{CONTENUS_ATTENDUS}} en qualité d'origine.

La mention **« Collaboration commerciale »** doit être visible dès le premier écran de chaque contenu, et sur chaque écran d'une série de stories.

Un **kit de création de contenu** vous est remis avec ce contrat : il dit ce que nous attendons en matière de lumière, de cadrage et de netteté, et distingue nettement ce qui nous engage de ce qui n'est qu'inspiration.

Vos contenus restent les vôtres. Vous nous accordez un droit d'usage délimité — supports, durée, territoire —, et non une cession de tous vos droits.`,
    body: `# CONTRAT DE COLLABORATION COMMERCIALE : MON VRAI

Référence **{{REFERENCE_DU_CONTRAT}}** — version **{{VERSION_DU_CONTRAT}}**

## Article 1 : Les parties

Le présent contrat est conclu entre :

**Bohemian Rolling House (Mon Vrai)**, micro-entreprise exploitant la marque Mon Vrai, dont le siège est situé à **{{ADRESSE_MON_VRAI}}**, immatriculée sous le numéro **{{SIREN_MON_VRAI}}**, représentée par **{{REPRESENTANT_MON_VRAI}}**, résidente fiscale en France,

ci-après « Mon Vrai »,

et

**{{CREATEUR_PRENOM}} {{CREATEUR_NOM}}**, {{CREATEUR_QUALITE}}, demeurant **{{CREATEUR_ADRESSE}}**, joignable à **{{CREATEUR_EMAIL}}**, résident fiscal de **{{CREATEUR_PAYS_FISCAL}}**, {{CREATEUR_SOCIETE_SIRET}}, titulaire du compte Instagram **{{COMPTE_INSTAGRAM}}**,

ci-après « le Créateur »,

ensemble « les Parties ».

## Article 2 : Objet

Le Créateur s'engage, d'une part, à réaliser et remettre à Mon Vrai des photographies et des vidéos mettant en scène les imagiers Mon Vrai, et d'autre part à publier sur son compte Instagram les contenus définis à l'article 6.

Cette seconde partie constitue une **activité d'influence commerciale par voie électronique** au sens de l'article 1er de la loi n° 2023-451 du 9 juin 2023.

## Article 3 : Contrepartie

En contrepartie, Mon Vrai remet au Créateur, à titre définitif et sans obligation de restitution :

{{LISTE_DES_PRODUITS}}

soit **{{QUANTITE_DE_PRODUITS}} exemplaires**, d'une valeur commerciale totale de **{{VALEUR_TOTALE_PRODUITS}} €**.

{{STATUT_DES_PRODUITS}}

{{NOTES_PROTOTYPES}}

Aucune somme d'argent n'est versée au titre du présent contrat. Le Créateur fait son affaire des conséquences fiscales et sociales de cet avantage en nature au regard de sa situation personnelle, et déclare être en mesure de contracter à ce titre.

## Article 4 : Kit de création de contenu

Un kit de création de contenu au format PDF, référencé **{{BRIEF_VISUEL}}**, est annexé au présent contrat. Il est accessible au Créateur au moment de l'acceptation et demeure disponible depuis son espace partenaire pendant toute la durée du contrat. Le Créateur en prend connaissance **avant** d'accepter, et avant l'envoi des livres.

Ce document distingue expressément les **exigences**, qui engagent le Créateur — lumière, cadrage, netteté, propreté du décor, définition des fichiers —, et les **inspirations**, qui ne l'engagent pas. Un contenu ne peut être refusé que sur le fondement d'une exigence écrite au kit accepté.

## Article 5 : Transparence de la collaboration

**5.1 — Mention obligatoire.** Chaque contenu publié au titre du présent contrat indique clairement son caractère commercial par la mention **« Collaboration commerciale »** ou **« Publicité »**.

**5.2 — Visibilité de la mention.** La mention est lisible sans effort, contrastée sur son fond, et présente **dès le premier écran** et **pendant toute la durée** du contenu. Dans une série de stories, **chaque écran** porte la mention, et non le seul premier. Les formules « ad », « sp », « sponso », « collab », « merci à », ainsi que le simple identifiant de la marque, ne satisfont pas à cette obligation.

**5.3 — Outil de la plateforme.** Le Créateur active en outre l'outil de partenariat rémunéré d'Instagram lorsque le format le permet. Cette activation s'ajoute à la mention et ne la remplace pas.

**5.4 — Avantage en nature.** Le Créateur indique que les livres lui ont été offerts.

## Article 6 : Engagements de publication

**6.1 — Publication.** Le Créateur publie une publication sur son compte Instagram, au format **{{FORMAT_DE_LA_PUBLICATION}}**, choisi et arrêté avant la signature du présent contrat. Cette publication paraît **{{DATE_DE_LA_PUBLICATION}}**.

**6.2 — Prises de parole en story.** Le Créateur réalise **quatre prises de parole distinctes**, à quatre dates différentes réparties sur deux mois, aux dates suivantes, acceptées ensemble : **{{DATES_DES_PRISES_DE_PAROLE}}**.

Une prise de parole n'est pas un écran de story : c'est une séquence dédiée aux livres, comportant au minimum **{{NOMBRE_ECRANS_PAR_PRISE_DE_PAROLE}}**, au cours de laquelle le Créateur montre les ouvrages et en parle. Un écran isolé, une reprise sans commentaire ou un simple repartage ne constituent pas une prise de parole.

Chaque prise de parole présente les livres et fait apparaître le **code promotionnel attribué au Créateur**, lisible sans effort pendant au moins trois secondes.

**6.3 — Story à la une.** Le Créateur ajoute à son profil Instagram une **story à la une** présentant les livres et le code promotionnel.

Cette story à la une est en ligne au plus tard **{{DATE_LIMITE_STORY_A_LA_UNE}}** et y demeure accessible pendant **{{DUREE_MAINTIEN_STORY_A_LA_UNE}}**. Le code y est lisible et la marque identifiable. **Cet engagement est ferme** : il ne dépend ni de la fréquentation du compte, ni de l'organisation du profil.

Si le code promotionnel change ou cesse d'être valable, Mon Vrai en informe le Créateur par courriel. Le Créateur met la story à la une à jour, ou la retire, dans les **sept jours** suivant cette information.

**6.4 — Calendrier.** Les dates ci-dessus sont annexées au présent contrat. Toute modification est convenue par écrit entre les Parties avant la date concernée.

**6.5 — Sincérité.** Mon Vrai n'impose au Créateur aucun avis, aucune formule élogieuse et aucune affirmation sur les livres. Les contenus publiés reflètent ce que le Créateur a réellement constaté. Aucune allégation relative à la santé, à l'éveil ou au développement de l'enfant ne peut être demandée ni suggérée, et aucune promesse de résultat ne peut être formulée.

## Article 7 : Fichiers à remettre à Mon Vrai

À l'occasion de chaque publication et de chaque prise de parole, le Créateur remet à Mon Vrai les photographies originales et les rushs vidéo correspondant aux contenus convenus, dans un délai de **{{DELAI_REMISE_FICHIERS}}**.

Au total, le Créateur transmet {{CONTENUS_ATTENDUS}}.

**Photographies** : {{FORMATS_PHOTO}}. Haute résolution, qualité d'origine, **sans filigrane** ni logo.

**Vidéos et rushs** : {{FORMATS_VIDEO}}, {{DUREE_DES_RUSHS}}. **Qualité d'origine**, sans texte incrusté, sans musique, sans filtre et sans habillage — c'est-à-dire les fichiers tels qu'ils existent avant montage, et non les versions publiées.

Les fichiers sont transmis par : **{{MODE_DE_TRANSMISSION}}**.

## Article 8 : Statistiques

Le Créateur transmet à Mon Vrai les statistiques dont il dispose pour chaque publication et chaque prise de parole — portée, vues, interactions, clics —, sous **{{DELAI_ENVOI_STATISTIQUES}}**, sous la forme de captures d'écran lisibles ou d'un export.

Le Créateur **ne garantit aucun résultat** : ni nombre de vues, ni interactions, ni ventes, ni utilisation du code promotionnel. Ses engagements sont des obligations de moyens, à l'exception des engagements de parution de l'article 6, qui sont fermes.

## Article 9 : Validation et corrections

Mon Vrai dispose de **{{DELAI_DE_VALIDATION}}** à compter de la remise des fichiers pour faire part de ses observations.

Si un contenu ne respecte pas une exigence du kit accepté, Mon Vrai le signale en indiquant l'exigence en cause ; le Créateur dispose d'un délai d'au moins sept jours pour le reprendre, dans la limite d'une série de corrections par contenu.

Mon Vrai ne dispose d'**aucun droit de validation préalable** sur le propos tenu par le Créateur dans ses publications. Elle peut en revanche exiger la correction immédiate d'un manquement à l'article 5, d'une erreur de fait sur les livres ou de l'absence du code promotionnel.

## Article 10 : Droits d'utilisation par Mon Vrai

**10.1 — Droits concédés.** Le Créateur concède à Mon Vrai, sur les fichiers remis et sur les contenus publiés, le droit de les reproduire, de les représenter et de les adapter dans les conditions délimitées ci-après. Chacun de ces droits est concédé distinctement ; **tout droit non mentionné n'est pas concédé**.

**10.2 — Supports.** {{SUPPORTS_AUTORISES}}, à l'exclusion de tout autre.

**10.3 — Usage organique et usage publicitaire.** L'usage organique est compris, y compris le repartage des publications du Créateur sur les comptes de Mon Vrai. L'usage publicitaire payant est encadré comme suit : {{AUTORISATION_PUBLICITE_PAYANTE}}

**10.4 — Durée.** {{DUREE_DES_DROITS}}. Au terme de cette durée, Mon Vrai cesse toute nouvelle diffusion ; les supports déjà produits et les publications déjà en ligne peuvent demeurer en l'état.

**10.5 — Territoire.** {{TERRITOIRE_DES_DROITS}}.

**10.6 — Recadrage et montage.** Mon Vrai peut recadrer, raccourcir, assembler les contenus, y ajouter un texte, une musique ou son identité visuelle, sans dénaturer le contenu ni lui faire dire autre chose que ce qu'il montre.

**10.7 — Crédit.** Le Créateur est crédité ainsi : {{CREDIT_DU_CREATEUR}}. Son droit moral est inaliénable et lui reste acquis.

**10.8 — Droits supplémentaires.** {{DROITS_SUPPLEMENTAIRES_INFLUENCE}}

**10.9 — Ce qui n'est pas concédé.** La revente des contenus, leur cession à un tiers autre qu'un prestataire agissant pour le compte de Mon Vrai, leur dépôt à titre de marque et leur usage par une autre entreprise ne sont pas concédés.

## Article 11 : Garanties du Créateur

Le Créateur garantit qu'il est l'auteur des contenus, qu'il détient les droits nécessaires à la présente concession, et que les contenus ne reproduisent aucune œuvre, marque ou musique protégée appartenant à un tiers sans autorisation. Il fait son affaire des droits musicaux attachés aux bandes-son utilisées dans ses propres publications.

## Article 12 : Personnes reconnaissables et enfants

**Option sans visage : {{OPTION_SANS_VISAGE}}.** Lorsque cette option est retenue, aucun visage reconnaissable ne figure dans les fichiers remis à Mon Vrai, et le présent article ne s'applique qu'aux publications du Créateur.

À défaut, le Créateur recueille et remet à Mon Vrai, avant la livraison, une autorisation écrite de droit à l'image pour chaque personne reconnaissable, conforme au modèle annexé et portant sur les mêmes supports, durée et territoire que l'article 10.

Lorsqu'un enfant mineur est reconnaissable, l'autorisation est donnée par les **deux titulaires de l'autorité parentale**, et l'enfant est associé à la décision selon son âge et son degré de maturité. À défaut, le contenu n'est pas remis à Mon Vrai.

Toute autorisation peut être retirée pour l'avenir, par écrit ; Mon Vrai cesse alors la diffusion du contenu concerné dans un délai raisonnable.

## Article 13 : Données personnelles

Les images de personnes reconnaissables constituent des données à caractère personnel. Mon Vrai les traite pour les seules finalités du présent contrat, pendant la durée prévue à l'article 10.4, et répond des demandes d'accès, de rectification et d'effacement adressées à **[adresse de contact à compléter]**.

## Article 14 : Exclusivité

{{CONDITIONS_EXCLUSIVITE}}

## Article 15 : Retard et engagement non tenu

En cas de retard ou d'engagement non tenu, Mon Vrai adresse au Créateur un rappel par courriel, puis une mise en demeure lui laissant un délai de **quinze jours** pour s'exécuter.

Si, à l'issue de ce délai, les engagements de l'article 6 n'ont pas été tenus, le contrat est résolu de plein droit. Le Créateur restitue alors les livres, à ses frais s'ils sont en état d'être réexpédiés, ou rembourse leur valeur telle qu'indiquée à l'article 3, **à proportion des engagements non tenus**. Les livres ouverts ou abîmés de bonne foi ne font l'objet d'aucune demande.

La suppression d'une publication ou d'une story à la une avant le terme convenu équivaut à un engagement non tenu, sauf motif légitime porté à la connaissance de Mon Vrai.

**Aucune pénalité forfaitaire n'est due.** Aucune des Parties n'est tenue d'un dommage imprévisible ou étranger à l'exécution du présent contrat.

## Article 16 : Indépendance des Parties

Le Créateur organise librement son travail et n'est soumis à aucun pouvoir de direction, de contrôle ou de sanction de Mon Vrai. Le présent contrat ne crée ni contrat de travail, ni mandat, ni société entre les Parties.

## Article 17 : Confidentialité

Le kit de création de contenu, les échanges préparatoires et les ouvrages non encore commercialisés sont confidentiels jusqu'à leur mise en vente publique.

## Article 18 : Durée et résiliation

Le contrat prend effet à son acceptation, couvre la période du **{{DATE_DEBUT_CAMPAGNE}}** au **{{DATE_FIN_DE_CAMPAGNE}}**, et s'achève à l'exécution de l'ensemble des engagements — sans préjudice de l'article 6.3, qui court jusqu'au terme du maintien de la story à la une, et de l'article 10, qui survit pour la durée qui y est prévue.

Chaque Partie peut y mettre fin avant l'expédition des livres, par écrit et sans indemnité.

## Article 19 : Droit applicable

Le présent contrat est soumis au droit français, notamment au code de la consommation, au code de la propriété intellectuelle et à la loi n° 2023-451 du 9 juin 2023.

Les Parties rechercheront une solution amiable avant toute action. Lorsque le Créateur contracte en dehors de toute activité professionnelle, il peut recourir gratuitement à un médiateur de la consommation : **[médiateur et coordonnées à compléter]**.

## Acceptation

Accepté par voie électronique le **{{DATE_ACCEPTATION}}** par **{{CREATEUR_PRENOM}} {{CREATEUR_NOM}}**, sous la référence **{{REFERENCE_DU_CONTRAT}}**.`,
  },
];

/** Ce qu'un brouillon donne à `upsertContract`, les champs non rédigés mis à zéro. */
export const draftToContract = (d: ContractDraft) => ({
  name: d.name,
  type: d.type,
  version: d.version,
  summary: d.summary,
  body: d.body,
  variables: d.variables,
  requiredVariables: [],
  expected: d.expected,
  publications: d.publications.map((p, i) => ({ id: `pub_${i + 1}`, label: p.label, qty: p.qty, options: p.options })),
  guide: EMPTY_GUIDE,
  active: true,
});
