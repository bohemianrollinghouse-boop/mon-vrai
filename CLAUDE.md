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

## Factures

`src/lib/invoice/issue.ts` émet la facture (numéro séquentiel via transaction, PDF
pdf-lib, dépôt privé dans `invoices/<année>/`). Appelée par le webhook Stripe, par
l'action admin, et à la volée par `/api/factures/[id]` (acheteur ou admin seulement).
Un PDF déjà déposé n'est jamais régénéré : c'est un document comptable figé.

## Administration

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
  — leur premier contenu est écrit dans `lib/blocks/editorial-pages.ts`, qui sert au
  seed et à `migrate-prod.ts --editorial`. Une fois la page enregistrée depuis
  l'éditeur, c'est la base qui fait foi et ce fichier ne la rattrape plus. Leurs blocs
  de récit
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
la caisse Stripe. Stock : décrémenté au paiement ; « réservé » = payé non expédié.

Les réglages sont éclatés en deux pages, donc en deux actions (`actions/settings.ts`) :
`/admin/reglages` (`saveSettingsAction`) et `/admin/livraison` (`saveShippingAction`,
tarifs + expéditeur/colis Boxtal). Chacune relit `getSettings()` et ne réécrit que ses
propres champs — sans quoi l'autre page serait remise à ses valeurs par défaut.

## Ports locaux

Firestore émulé sur **8180** (8080 est pris par OrbStack sur cette machine) ;
auth 9099, storage 9199, UI 4000.
