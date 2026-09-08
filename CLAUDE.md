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
dans le bucket par le seed. Reste : brancher les vrais projets Firebase/Stripe/Resend
(voir `.env.example`) et pointer le DNS au go-live. Voir `PLAN.md`.

## Paiement

Page `/commande` (groupe `(checkout)`, sans en-tête du site) : Stripe Elements en
intent différé. Le devis (`lib/checkout/quote.ts`) est la seule source des montants ;
`createPaymentIntentAction` le recalcule et met tout ce que le webhook doit savoir dans
les métadonnées du PaymentIntent (lignes figées `cart`, adresse, port, remise, e-mail).
`payment_intent.succeeded` crée la commande (idempotent sur l'id du PaymentIntent).
Clés publiables par mode : `STRIPE_PUBLISHABLE_KEY(_TEST)` (pas de `NEXT_PUBLIC_`, la
page les passe au client selon le mode choisi dans l'admin). Codes promo = promotion
codes Stripe. Seule la carte est proposée (Apple/Google Pay via le paiement express).

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

FAQ : les questions vivent dans `content/contact.faq.items` (rubrique, masquée) et se
gèrent dans `/admin/faq`. Tarifs de livraison : `settings.shipping.rates`, proposés à
la caisse Stripe. Stock : décrémenté au paiement ; « réservé » = payé non expédié.

## Ports locaux

Firestore émulé sur **8180** (8080 est pris par OrbStack sur cette machine) ;
auth 9099, storage 9199, UI 4000.
