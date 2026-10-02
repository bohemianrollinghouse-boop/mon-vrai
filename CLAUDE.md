@AGENTS.md

# Mon Vrai — site autonome

Boutique d'imagiers pour les 6–18 mois, en remplacement de Shopify. Le plan complet
est dans `PLAN.md` ; ce fichier ne dit que ce qu'il faut savoir pour toucher au code.

## Commandes

- `pnpm emulators` puis `pnpm seed` — base locale peuplée avec le contenu réel exporté de Shopify.
- `pnpm dev` — site sur http://localhost:3000 (admin de dev : voir `.env.example`).
- `pnpm check` — typecheck + lint + tests. À faire passer avant tout push.

## Règles du code

- **Tout accès aux données passe par `src/lib/db/*`** et par le SDK Admin (`server-only`).
  Le navigateur ne lit jamais Firestore : il n'y a pas de SDK client hors authentification.
- **Chaque document lu est validé par son schéma zod** (`src/lib/domain/types.ts`). Une
  donnée malformée doit échouer à la lecture, pas plus tard dans un composant.
- **Les montants sont des entiers en centimes.** Seul `domain/money.ts` formate.
- **Les actions serveur sont des entrées publiques** : valider avec zod, relire en base,
  ne rien croire du client. Une action utilisée dans `<form action>` doit renvoyer `void`
  (variantes `*Form`) ; celles de `useActionState` renvoient un résultat.
- **Stock et numéros** : uniquement via les transactions de `db/orders.ts`. Ne jamais
  incrémenter un compteur hors transaction.
- **Styles** : Tailwind avec les jetons de `globals.css` (`@theme`). Pas de couleur en dur
  dans un composant ; les teintes passent par `TINT_BG` / `TINT_INK`.
- **Textes** : en français, apostrophes typographiques bienvenues (la règle
  `react/no-unescaped-entities` est désactivée pour ça).

## Pièges déjà rencontrés

- `server-only` lève sous Node nu : les scripts (`scripts/*.ts`) se lancent avec
  `NODE_OPTIONS=--conditions=react-server` (déjà dans `pnpm seed`).
- `cookies()` s'écrit dans une action serveur ou un route handler, jamais pendant le
  rendu — d'où `ensureCartId()` (action) distinct de `readCartId()` (page).
- Le chemin courant vient de l'en-tête `x-pathname` posé par `src/proxy.ts`.

## Ce qui n'est pas encore là

Stripe Tax est prêt mais désactivé (`STRIPE_TAX=0`) ; la vidéo d'accueil est rapatriée
dans le bucket par le seed. Voir `PLAN.md`.

**Le site est en ligne** sur https://monvrai.fr (DNS basculé le 2026-09-08, voir
`apphosting.yaml`). Toute modification de schéma doit donc être précédée d'une
migration des données de production : `parseDoc` lève sur un document invalide, et
l'en-tête comme le pied de page sont rendus sur chaque page — un schéma resserré
avant migration met le site entier hors service. `scripts/migrate-prod.ts` en donne
le patron : lecture brute, répétition à blanc par défaut, idempotence.

## Paiement

Page `/commande` (groupe `(checkout)`, sans en-tête du site) : Stripe Elements en
intent différé. Le devis (`lib/checkout/quote.ts`) est la seule source des montants ;
`createPaymentIntentAction` le recalcule et met tout ce que le webhook doit savoir dans
les métadonnées du PaymentIntent (lignes figées `cart`, adresse, port, remise, e-mail).
`payment_intent.succeeded` crée la commande (idempotent sur l'id du PaymentIntent).
Clés publiables par mode : `STRIPE_PUBLISHABLE_KEY(_TEST)` (pas de `NEXT_PUBLIC_`, la
page les passe au client selon le mode choisi dans l'admin). Codes promo = promotion
codes Stripe. Seule la carte est proposée (Apple/Google Pay via le paiement express).

## Codes promo

`/admin/codes-promo` les porte **tous**, maison et partenaires : un code promo reste un
code promo, et les chercher à deux endroits selon qui les porte n'avait pas de sens. Un
filtre « Maison / Partenaires » sépare les deux quand il le faut.

Ils ne se règlent pas pareil pour autant. Un code **maison** se décrit entièrement là —
type, valeur, dates, limites. Celui d'un **partenaire** est le **reflet de sa campagne**
(`db/campaigns.syncCampaignPromo`, réécrit à chaque enregistrement, clôture ou
suppression de campagne) : sa remise, ses dates et son extinction viennent d'elle et ne
sont donc pas dans son formulaire — les y proposer serait promettre un réglage que la
prochaine sauvegarde de campagne effacerait. Son éditeur les **affiche** et renvoie à la
campagne d'un bouton ; `savePromoAction` refuse toujours d'écraser un code de partenaire.

L'offre **« collection complète »** (le panier contient tous les titres publiés, le moins
cher est offert) se règle sur la carte de cet écran : un interrupteur, et un **jour
d'arrêt** (`settings.promos.collectionOffer.endsOn`, `AAAA-MM-JJ`). Elle **s'éteint
d'elle-même** au premier instant de ce jour — le dernier servi est la veille —, sans
tâche à programmer : chaque lecture compare le jour d'arrêt à celui qu'on est
(`offerRunning`, `offerDay` en heure de **Paris** : une date annoncée doit tomber à
minuit chez le client, pas en UTC). Les cinq endroits qui lisent l'offre passent tous par
là, et jamais par le seul `enabled` — devis, moteur des codes, modal, blocs, panier. La
page panier le reçoit du devis plutôt que de lire l'heure : un composant serveur reste
pur. La fin est **annoncée** partout où l'offre est proposée (encart du catalogue, bloc
« Compléter la collection », modal) par `offerEndNotice`, écrit une seule fois — changer
la date ne laisse rien derrière, et une offre finie n'annonce plus rien puisqu'elle ne
s'affiche plus.

Elle ne se cumule avec **aucun** code : un livre offert est déjà la remise la
plus forte qu'on consente. C'est l'offre qui l'emporte — elle vient du panier et ne se
réclame pas —, et le code est refusé **en le disant** : `PromoContext.collectionOffer`
fait rendre à `rejectionReason` le message de `COLLECTION_EXCLUSIVE_REASON`, en premier,
avant l'état du code (c'est la raison qui intéresse le client). Le refus remonte donc
seul partout où un code se saisit ou s'affiche : saisie au panier (`addPromoCode`),
récapitulatif, caisse. `buildQuote` calcule l'offre AVANT les codes et passe le drapeau ;
`resolvePromos` le recalcule lui-même quand on ne le lui donne pas, pour qu'aucun appelant
ne puisse l'oublier. Un code de partenaire posé par un lien est refusé comme les autres,
mais la vente **reste attribuée** au partenaire par le lien.

Ce qui appartient au **code** et non à la campagne — panier minimum, limite totale,
cumul (`stackWith`), port offert — se règle là, par `savePartnerPromoAction` →
`db/promos.setPromoSettings`, qui n'écrit que ces champs. En retour, `syncCampaignPromo`
les **reprend tels quels** : sans cela ils disparaîtraient au premier enregistrement de
la campagne, comme `influenceStock` sur `upsertProduct`.

## Boxtal (expéditions)

`lib/boxtal/client.ts` (API v3, auth Basic, deux paires de clés : API et composant
carte), `lib/boxtal/request.ts` (construction pure de la demande, testée),
`lib/boxtal/shipment.ts` (création d'étiquette, synchro documents/suivi, avancement du
statut). Boxtal v3 **ne cote pas** : le prix client vient de `settings.shipping.rates`,
l'offre Boxtal du tarif (`boxtalOfferCode`) sert à créer l'étiquette ; une offre relais
affiche la carte (`components/checkout/RelayPicker.tsx`, jeton via `getMapToken`).
Webhooks : `/api/boxtal/webhook` (HMAC `x-bxt-signature`), souscriptions déclarées par
`pnpm boxtal:subscribe`. L'étiquette est copiée dans le bucket (`labels/`), servie par
`/api/etiquettes/[id]` (admin). Le suivi fait passer la commande en expédiée / livrée.

## Factures et bons de livraison

`src/lib/invoice/issue.ts` émet la facture (numéro séquentiel via transaction, PDF
pdf-lib, dépôt privé dans `invoices/<année>/`). Appelée par le webhook Stripe, par
l'action admin, et à la volée par `/api/factures/[id]` (acheteur ou admin seulement).
Un PDF déjà déposé n'est jamais régénéré : c'est un document comptable figé.

Le **bon de livraison** (`src/lib/pdf/order-slip.ts`, `/api/bons/[id]`, administrateurs
seulement) dit l'autre moitié : à qui part le colis et ce qu'il y a dedans. Il existe
pour les **commandes offertes** — le kit d'un partenaire, le lot d'un gagnant de concours
—, qui ne sont jamais facturées : sans lui, rien dans l'admin ne dit ce qu'on a envoyé.
Rien n'y porte de prix : des prix à zéro laisseraient croire à un document de vente.
Il se rend **à la volée**, sans rien déposer dans le bucket : une commande change
(adresse corrigée, suivi ajouté) et le bon suit, tout le contraire d'une facture.

C'est `offeredOrder()` (`domain/order-state.ts`) qui réunit les deux sortes de colis
offert partout où la distinction ne tient qu'à « cette commande n'a rien encaissé » :
chiffre d'affaires, facturation, dépenses, tableau de bord. `tookSaleStock()`, à côté,
dit si les exemplaires ont été pris sur le stock de vente — un cadeau ne rend que ce
qu'il a pris.

La page A4, la palette, les vignettes produit et le `Writer` des deux documents vivent
dans `src/lib/pdf/layout.ts` : ce qui sert aux deux va là, ce qui n'appartient qu'à un
document reste chez lui.

## Stocks

Deux stocks par titre, et jamais un seul : `Product.stock` (la **vente** ; `null` = non
suivi, vente illimitée) et `Product.influenceStock` (l'**influence** — les exemplaires
mis de côté pour les partenaires et les jeux). Ils ne répondent pas à la même question,
et les confondre ferait vendre un livre promis ou croire en stock ce qui est déjà parti
en kit. Le stock influence est **interne** : rien ne l'affiche côté boutique, il ne se
règle que dans `/admin/stocks`, et la fiche produit n'y touche pas (`upsertProduct` le
reprend tel quel — un enregistrement de fiche ne doit pas le remettre à zéro).

Un colis offert **sort de l'un des deux**, et `deductStock` (sur le kit ou sur le lot)
dit lequel : coché → la vente, décomptée à la commande comme une vente l'est au paiement ;
décoché → l'influence, qui ne se décompte pas (voir plus bas). Ce qui a été pris est
inscrit sur la commande (`kit.stock`, `prize.stock`), et c'est lui qui dit à
`releaseStock`, en cas d'annulation, s'il y a quelque chose à rendre au stock de vente.

Le stock influence n'est PAS un compteur qui baisse : c'est une **déclaration** — ce
qu'on a mis de côté — de laquelle on retranche ce que les commandes ont emporté. D'où
trois colonnes (`lib/admin/influence-stock.ts`, pur et testé) : **stock** (le nombre
qu'on écrit soi-même, et qui ne bouge que si on le réécrit), **envoyé** (`influenceSent`,
lu sur les commandes : tous les kits et lots pris sur ce stock, annulés et remboursés
exclus) et **disponible** = stock − envoyé − réservé.

Ce choix n'est pas cosmétique. Un compteur décrémenté à la commande aurait ignoré tous
les kits partis AVANT l'existence de ce stock, et il aurait fallu un rattrapage à la
main, impossible à faire sans recompter les départs déjà décomptés. La soustraction, elle,
retrouve l'histoire entière toute seule, et une commande annulée en sort d'elle-même.
`createGiftOrder` ne touche donc au stock que lorsqu'il s'agit du stock de VENTE.

**Réservé** ne fait pas une colonne : c'est ce qu'une participation ouverte ou un concours
en cours a promis sans que personne ait encore commandé. L'exemplaire n'est plus
disponible sans être parti — il se dit en une ligne sous le titre, là où l'on explique
l'écart. Le jour où le kit est commandé il passe de « réservé » à « envoyé » : le
disponible ne bouge pas, il avait déjà été retenu. Il passe en négatif quand on a promis
plus qu'on n'a : c'est une alerte, pas un blocage.

Partout où l'on choisit les livres d'un kit ou d'un lot (`WelcomeKitEditor`, alimenté par
`lib/admin/kit-choices.ts`), c'est le **disponible** qui est affiché, jamais le stock :
le stock compte aussi ce qui est déjà parti, et promettre dessus reviendrait à promettre
deux fois le même livre. La campagne ou le concours qu'on est en train de régler est
écarté du réservé (`exceptId`) — sans quoi il se retrancherait sa propre promesse.

La correction ordinaire consiste donc à **réécrire le stock** (champ de la colonne Stock,
`setInfluenceStockAction`) avec le nombre qu'on vient de compter sur l'étagère ; la carte
« Réception influence » ajoute un carton sans avoir à connaître le total.

Une commande de kit n'est jamais refusée faute de stock — un partenaire ne doit pas
buter là-dessus ; le disponible passe en négatif et la page le signale.

## Concours

`/admin/concours` — les jeux : ceux montés sur nos seuls réseaux et ceux montés **avec
d'autres créateurs**, dans un même écran et un même document (collection `contests`).
Un concours n'est pas une campagne : une campagne négocie une contrepartie avec
quelqu'un qu'on connaît (un kit contre des contenus, un code contre une commission) ; un
concours promet un lot à quelqu'un qu'on ne connaît pas encore. D'où une collection à
part, et non un `Operation` de plus.

- **Un seul lot pour tout le concours** (`prize`) : des titres du catalogue, plus ce qui
  n'en est pas (`extra`, écrit en clair). Chaque gagnant reçoit le même — c'est
  `winnersWanted` qui dit combien de fois.
- **L'état se déduit** (`lib/contests/state.ts`, pur et testé) : brouillon tant que
  `published` est faux, puis à venir, en cours, **tirage à faire** (la clôture est
  passée, les gagnants manquent), **lots à envoyer**, terminé. Aucun statut à tenir à
  jour, donc aucun qui puisse mentir — c'est la règle des campagnes. Le badge de la barre
  latérale compte les deux états qui attendent quelque chose de nous.
- **Les co-organisateurs** (`hosts`) sont de deux sortes. Un **partenaire de la base**
  (`influencerId` renseigné) voit le concours dans son espace dès qu'il est publié ; un
  **créateur invité** pour ce jeu-là n'a qu'un nom et un pseudo, et ne voit rien — c'est
  nous qui tenons ses chiffres. L'identifiant du co-organisateur EST celui du partenaire
  quand il en a un : il ne peut donc pas figurer deux fois, et ses gagnants gardent leur
  rattachement. `hostInfluencerIds` répète ces identifiants à plat, seule forme que
  Firestore sache interroger (`array-contains`).
- **Les places sont communes** : un concours à trois lots monté à deux ne fait pas six
  gagnants. Le premier qui déclare prend la place, et le refus vient de la **relecture en
  transaction** (`db/contests.addWinner`), pas d'un compte fait dans l'écran — deux
  déclarations simultanées se départagent en base.
- **Le lot part comme un kit** : `createPrizeOrder` crée une commande offerte, à 0 €,
  marquée `prize` sur la commande (`Order.prize`, à côté de `Order.kit`). Elle s'expédie
  par Boxtal depuis /admin/commandes, porte un bon de livraison, ne donne jamais lieu à
  facture, et son étiquette s'inscrit toute seule en dépense. À **domicile seulement** :
  un gagnant donne son adresse, il n'y a pas de carte de points relais à lui montrer.
  Idempotent sur le gagnant — un double clic n'envoie pas deux colis.
- Côté partenaire (`components/site/ContestPanel.tsx`, actions dans
  `lib/auth/partner-actions.ts`) : il lit ce qui est convenu, **déclare son gagnant**
  (pseudo, nom, e-mail, adresse) et **déclare ses chiffres** (publication, participants,
  abonnés gagnés — que rien d'autre ne nous apprendrait). Le concours est toujours relu
  en base et son appartenance vérifiée : sans quoi un partenaire s'inviterait dans le jeu
  d'un autre, et lui prendrait un lot.
- **L'autonomie** (`Influencer.contestAutonomy`) laisse un partenaire **monter ses
  propres jeux** : il en écrit le nom, le réseau, les dates et la mécanique, les corrige
  tant que le jeu court, et retire sa proposition tant que rien n'est promis
  (`partnerCanEdit`, `partnerCanDelete`, purs et testés). Deux choses ne sont JAMAIS
  dans ses formulaires, parce qu'elles coûtent à la maison : le **lot** (du stock et du
  port) et la **publication**, qui est notre validation. Un concours qu'il propose porte
  donc `proposedBy` et reste `published: false` — `awaitingReview()` le dit, la liste et
  sa fiche l'affichent « À valider » plutôt que « Brouillon » (un brouillon qu'on a
  écrit et un brouillon qu'on nous soumet n'appellent pas le même geste), et le badge de
  la barre latérale le compte comme un tirage à faire. **La validation se fait dans le
  bandeau qui l'annonce** : un bouton « Publier le concours » (`publishContestAction` →
  `setContestPublished`, qui ne réécrit que la publication), et non le seul interrupteur
  du bas de formulaire — une proposition n'attend qu'un geste, le chercher au milieu de
  tout ce qui se règle revient à ne pas l'avoir. Il ne paraît qu'une fois le lot posé :
  publier sans lot est refusé là comme à l'enregistrement. Il est son propre co-organisateur
  dans `hosts` : c'est par là que le concours le retrouve, et ce qui lui donne une ligne
  de chiffres. `listContestsForInfluencer` lui montre ses propositions avant publication
  — les lui cacher reviendrait à le faire écrire dans le vide. Le droit se règle
  partenaire par partenaire, sur l'**onglet « Concours » de sa fiche**
  (`saveInfluencerAutonomyAction`), et non dans le formulaire d'identité : celui-ci ne
  le porte pas, et `upsertInfluencer` le reprend donc tel quel — comme `influenceStock`
  sur `upsertProduct`, un enregistrement d'identité ne doit pas retirer un droit.
- Supprimer un concours est refusé dès qu'un lot est parti : sa commande resterait sans
  rien pour l'expliquer. Retirer un co-organisateur ne supprime pas ses gagnants — un lot
  promis reste dû.

## Gestion (dépenses et documents)

- `/admin/depenses` — **toute la trésorerie**, dans un seul compte. Deux sources s'y
  rejoignent : les lignes **saisies** (collection `expenses` — les frais, et les entrées
  d'un autre bord : apport, subvention, remboursement, vente en salon), et les **ventes
  du site**, qui ne se saisissent pas. Elles sont déduites des commandes encaissées
  (mêmes règles qu'ailleurs : `livemode`, statuts `COUNTED`, kits offerts exclus) et
  emportent avec elles deux prélèvements, aux taux de `settings.costs` : les
  **cotisations URSSAF** et la **commission Stripe** (part variable + part fixe par
  transaction), calculées commande par commande — c'est ce qui fait tomber cet écran et
  Revenus sur le même chiffre. Les cotisations portent aussi sur les **entrées saisies**
  dont le drapeau `taxable` est posé : une vente en salon est du chiffre d'affaires, un
  don ou un apport non, et aucune règle ne les distingue à coup sûr — d'où une case à la
  saisie plutôt qu'une déduction du poste. La commission Stripe, elle, ne concerne que
  les ventes du site : une vente en espèces ne passe pas par la carte. Tout se calcule
  **ligne à ligne** (`urssafOn`) : la retenue s'affiche à côté de chaque montant et à la
  saisie (`UrssafNote`, qui écoute le formulaire), et la somme de ces lignes EST le total
  — les deux ne peuvent donc pas se contredire. Cette somme d'arrondis peut en revanche
  s'écarter d'un centime ou deux du taux appliqué au total : c'est voulu.
  Ces cotisations sont une **provision**, pas un versement : ressaisir le paiement à
  l'URSSAF le compterait deux fois, et la page le signale quand elle en repère un. Un montant saisi est **positif en centimes**, le sens
  vient de `direction` ; la date est un **jour civil** (`AAAA-MM-JJ`) et non un
  horodatage — une facture n'a ni heure ni fuseau, et les mois se regroupent par préfixe.
  Une ligne « engagée » (reçue, pas payée) est comptée à part des sorties réelles.
  Un filtre par poste écarte les ventes : les totaux doivent porter sur ce que la liste
  montre. Calculs dans `lib/admin/expenses.ts` (fonctions pures, testées) : `cashTotals`
  marie les deux sources, plus postes, mois, **charges fixes** (un frais récurrent ne
  compte qu'une fois — sa dernière occurrence) et **coût rattaché aux titres**. Un frais
  couvre **plusieurs titres** (`productSlugs`) et porte **plusieurs justificatifs**
  (`documentIds`) : une norme CE ou une série d'essais en concerne rarement un seul. Le
  montant se partage alors à parts égales — `splitCents` donne des centimes entiers dont
  la somme fait exactement le montant, pour que la colonne reste sommable. Le formulaire
  sait aussi **déposer** des pièces directement : les fichiers joints deviennent des
  documents de la bibliothèque et s'attachent au mouvement, avec date et nature devinées
  d'après le poste. Vocabulaire et filtres partagés avec l'export CSV :
  `lib/admin/expense-ui.ts`.
- **L'étiquette d'un colis offert s'inscrit toute seule** (`lib/admin/gift-expense.ts`,
  écrite par `lib/boxtal/shipment.ts` à la création de l'expédition) — le kit d'un
  partenaire comme le lot d'un concours. Le colis est offert à qui le reçoit, port
  compris — pas à la maison, qui paie Boxtal ; et comme cet écran écarte les commandes
  offertes des ventes, la sortie n'apparaissait nulle part. Une ligne par colis,
  poste « Port & affranchissement », fournisseur Boxtal, sous l'identifiant
  `exp_kit_<commande>` ou `exp_lot_<commande>` — déduit et non tiré au sort, pour qu'elle
  ne puisse pas s'empiler (et `exp_kit_` reste ce qu'il était : les lignes déjà posées
  doivent continuer de se retrouver). Le montant vient du
  prix rendu par Boxtal (HT, passé en TTC), à défaut du barème de `shipping/tariffs.ts` ;
  faute des deux, la ligne est posée à zéro et « engagée », à compléter à la main. Les
  ventes ne passent pas par là : leur port réel est déjà retiré du revenu dans
  /admin/revenus, commande par commande. Conséquence assumée : le port d'un colis offert
  se lit aux deux endroits — retranché du net dans Revenus, et en dépense ici.

- Le schéma d'`Expense` a changé une fois (un titre → plusieurs, un justificatif →
  plusieurs, exemplaires retirés). Plutôt qu'une migration, `upgradeExpense` reprend
  l'ancienne forme **à la lecture** (`z.preprocess`, comme `ShippingRate`) : `parseDoc`
  lève sur un document invalide, et l'écran entier tomberait. `src/lib/domain/expense.test.ts`
  garde ce filet en place — ne pas le retirer tant que des lignes d'avant subsistent.
- La différence avec `/admin/revenus` tient en une phrase : là-bas on regarde ce qu'une
  **vente** laisse une fois tous ses coûts retirés (fabrication, port réel, commission) ;
  ici, ce que le **compte** fait sur une période, frais de structure compris.
- `/admin/documents` — les pièces administratives (collection `documents`) : normes CE,
  rapports de laboratoire, attributions d'ISBN, contrats, assurances. **Rien n'est
  public** : le fichier va sous `documents/` (fermé par `storage.rules`, comme
  `invoices/`) et n'est servi que par `/api/documents/[id]`, à un administrateur. On ne
  stocke donc pas d'URL, seulement le chemin dans le bucket — c'est toute la différence
  avec la médiathèque. Une pièce porte une fin de validité : `lib/admin/doc-status.ts`
  prévient deux mois avant l'échéance, pas le jour venu.

Les **ISBN** s'attribuent au bas de `/admin/documents`, l'attestation sous les yeux, et
non dans la fiche produit : `saveIsbnAction` écrit `Product.isbn` après avoir vérifié la
clé de contrôle (`domain/isbn.ts`) et l'unicité du numéro dans le catalogue.

Une dépense peut désigner un document pour justificatif ; supprimer le document délie
les lignes (`db/expenses.detachDocument`) plutôt que de laisser un lien mort.

## Fréquentation

Balise maison, sans cookie (`components/site/StatsBeacon` → `/api/stats/hit` →
`lib/db/stats.ts`), lue dans `/admin/statistiques`. Trois choses ne sont jamais
comptées : les robots (`isBot`), **les administrateurs connectés** (la session est
vérifiée côté serveur dans la route de la balise), et les **adresses IP exclues**
(`settings.stats.excludedIps`, réglées au bas de /admin/statistiques). Les deux
dernières se complètent : la session couvre le navigateur où l'on est connecté,
l'adresse couvre le téléphone et la fenêtre privée.

L'adresse IP est **comparée puis jetée** — elle n'est ni hachée, ni stockée, ni
cumulée (`visitorHash` s'en passe volontairement, voir `lib/stats/keys.ts`). Une IPv6
est ramenée à son **/64** : le préfixe d'un foyer est stable, la fin de l'adresse
change toute seule, et une exclusion posée sur l'adresse entière aurait cessé d'agir
en quelques heures. La liste est relue **au plus une fois par minute**
(`db/stats.excludedIps`) : la balise passe à chaque page vue et toutes les 30 s pour
la présence, sans quoi chaque onglet ouvert ferait relire les réglages sans arrêt.
Une adresse ajoutée prend donc effet dans la minute. L'ajout au panier
(`lib/stats/record.ts`) applique les mêmes règles, sans quoi le parcours d'achat
compterait un essai que le reste de l'écran ne compte pas.

## Administration

La fiche d'un partenaire a **trois onglets** : « Identité » (la personne), « Campagnes »
(ce qu'on a négocié avec elle) et « Concours » (les jeux où elle figure, publiés ou non,
plus le réglage d'autonomie). Cet onglet range par partenaire ce que /admin/concours
range par concours : on y répond à « ai-je un jeu en cours avec cette personne ? ».

Coquille autonome (`src/app/admin/layout.tsx`, maquette « Mon Vrai - Admin ») : barre
latérale 240 px avec badges, contenu sur fond crème, **aucun élément du site public**.
Le site public vit dans le groupe `src/app/(site)/` avec son propre layout ; la racine
ne porte que la police et les métadonnées. Primitives dans `components/admin/ui.tsx`
(`GridTable`, `Tile`, `FilterPills`, `Switch`, `Segmented`, `Thumb`…). Vocabulaire des
commandes côté admin : `lib/admin/order-ui.ts` (« À expédier » = payée). Chiffres
partagés (badges, tableau de bord) : `lib/admin/counts.ts`.

`ActionForm` (client) publie les erreurs par champ dans `IssuesContext` ; un
`<Field name="chemin.du.champ">` les affiche. Ne pas passer de fonction en enfant
depuis une page serveur, ni imbriquer deux `ActionForm` (deux `<form>`). Un bouton
d'en-tête soumet un formulaire via `form="id"` + `hideFooter`. Dans une liste, une case
à cocher se poste en `"true"/"false"` (champ caché + case) : `parseForm` ignore les
booléens à crochets.

## Pages

Toutes les pages de contenu vivent dans la collection `pages` et se composent en blocs
(éditeur visuel Puck, `/admin/pages/<slug>`) : pages légales, « Notre histoire »,
accueil, catalogue, contact. Il n'y a plus de collection `policies`, ni de routes
statiques pour ces pages — seuls restent `/livres`, `/panier`, `/compte`, `/commande`
et `/recherche`.

`catalogue` et `contact` sont **épinglées** (`PINNED_SLUGS`) : l'interface du site y
renvoie en dur (panier vide, fiche livre, page 404), leur adresse ne peut donc pas
être changée depuis l'admin.

**L'adresse d'une page est son chemin réel** sous la racine : `notre-histoire` est
servie à `/notre-histoire`, par la route attrape-tout `(site)/[...slug]`. On peut
imposer un dossier en écrivant `infos/cgv`. Deux conséquences à connaître :

- Une adresse ne peut pas commencer par un segment que le site se réserve
  (`RESERVED_PATHS` dans `domain/system-pages.ts`) : la route statique gagnerait et la
  page serait injoignable. Refusé à l'enregistrement, pas seulement à l'affichage.
- Firestore lit « / » comme un séparateur de chemin : l'identifiant du document
  transpose les barres obliques (`db/pages.docId`), le champ `slug` reste la référence.

Les anciennes adresses (`/informations/…`, `/pages/…`, et les URL Shopify) redirigent
en 308 vers la nouvelle (`next.config.ts` + `content/redirects.json`).

- **Catalogue de blocs** : `src/lib/blocks/config.tsx`. Un bloc rend un composant de la
  charte (`components/site/*`), jamais du style refait à la main. Chaque bloc est une
  `<section>` portant son propre `site-wrap` — d'où un conteneur en **flux normal** à la
  racine et dans les colonnes : en `flex`, les marges `auto` de `site-wrap` l'emportent
  sur `align-self: stretch` et les blocs cessent d'être alignés.
- **Données du site** (catalogue, tri courant, coordonnées, questions fréquentes,
  réglages du formulaire de contact) : par les métadonnées Puck, pas par les props —
  `lib/blocks/metadata.ts` ne charge que ce que les blocs présents réclament, slots
  compris. Le rendu public et l'éditeur les passent tous les deux. Un composant
  marchand dans l'aperçu doit être inerte (`puck.isEditing`) : hors du site il n'y a
  pas de `CartModalProvider`, et le hook lèverait au rendu.
- Ce qui se règle ailleurs n'est pas recopié dans un bloc : les coordonnées restent
  dans les réglages, les questions dans `/admin/faq`. Deux blocs font exception, parce
  que le réglage n'a de sens que là où il s'affiche : le formulaire de contact porte ses
  sujets, et la FAQ peut porter ses propres questions (« Propres à cette page ») au lieu
  de la liste partagée. Les deux retombent sur l'ancienne source quand le champ est vide,
  pour qu'une page composée avant le changement ne bouge pas.
- **Trois formulaires, trois actions** sur la fiche d'une page — publication, contenu,
  SEO —, parce que l'éditeur ne peut pas être inclus dans un `<form>` (les boutons de
  Puck le soumettraient). Chacune relit la page et ne réécrit que ses champs.
- **Accueil** : la page marquée `home` est servie à la racine (`db/pages.setHomePage`
  tient l'unicité) ; son adresse propre y redirige. Sans page marquée, `/` retombe sur
  `content/home`. `content/story` et `content/home` ne sont plus
  affichés ni éditables : ils ne servent que de repli et d'amorce au seed.
- **SEO** : `PageSeo` étend le socle commun pour les pages seulement (partage,
  indexation, canonique). Les balises sont produites par `domain/page-metadata.ts`,
  partagé par la racine et l'attrape-tout — les deux routes émettent donc la même
  chose. Repli assumé : partage → SEO → titre de la page.
- Reprise d'un ancien corps de texte riche en blocs : `lib/blocks/from-html.ts` ; des
  contenus structurés : `lib/blocks/from-content.ts` (utilisé par le seed).
- **Pages rédigées** : « Notre histoire » et « Le concept » ne sont converties de rien
  — leur premier contenu est écrit dans `lib/blocks/editorial-pages.ts` (registre
  `EDITORIAL_PAGES`), qui sert au seed, à `migrate-prod.ts --editorial`, et au bouton
  **« Reprendre le contenu rédigé »** de `/admin/pages/<slug>`. Ce bouton est le seul
  moyen de poser ces pages en production sans ligne de commande ni clé de compte de
  service : il rebâtit les blocs et envoie au passage les photos manquantes depuis
  `content/editorial/` (livré au runtime par `outputFileTracingIncludes`). Une fois la
  page enregistrée depuis l'éditeur, c'est la base qui fait foi et ce fichier ne la
  rattrape plus — le bouton, lui, écrase. Leurs blocs de récit
  (`Chapitre`, `Sommaire`, `Chiffres`, `Panneau`, `Frise`, `PanneauSombre`,
  `ProseCentree`, `BandeauTeinte`) rendent `components/site/editorial.tsx`, comme les
  blocs de l'accueil rendent `home-sections.tsx`. Le sommaire pointe sur l'`ancre` des
  chapitres : un bloc ne voit pas ses voisins, il se saisit donc à la main.
- Les photos de ces deux pages se déposent dans `content/editorial/` (voir son README
  et `EDITORIAL_PHOTOS` dans le seed) ; celles qui manquent reprennent une photo
  d'ambiance, à remplacer dans l'éditeur.

FAQ : les questions vivent dans `content/contact.faq.items` (rubrique, masquée) et se
gèrent dans `/admin/faq`. L'écran « Contenus » a disparu : les pages sont toutes en
blocs, et ce qu'il réglait encore vraiment (sujets du formulaire de contact) est
descendu dans le bloc — `migrate-prod.ts --contact-form` l'y recopie. Tarifs de livraison : `settings.shipping.rates`, proposés à
la caisse Stripe. Stock : décrémenté au paiement ; « réservé » = payé non expédié (voir Stocks).

Les réglages sont éclatés en deux pages, donc en deux actions (`actions/settings.ts`) :
`/admin/reglages` (`saveSettingsAction`) et `/admin/livraison` (`saveShippingAction`,
tarifs + expéditeur/colis Boxtal). Chacune relit `getSettings()` et ne réécrit que ses
propres champs — sans quoi l'autre page serait remise à ses valeurs par défaut.

## Ports locaux

Firestore émulé sur **8180** (8080 est pris par OrbStack sur cette machine) ;
auth 9099, storage 9199, UI 4000.
