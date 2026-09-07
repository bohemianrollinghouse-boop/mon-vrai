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

## Factures

`src/lib/invoice/issue.ts` émet la facture (numéro séquentiel via transaction, PDF
pdf-lib, dépôt privé dans `invoices/<année>/`). Appelée par le webhook Stripe, par
l'action admin, et à la volée par `/api/factures/[id]` (acheteur ou admin seulement).
Un PDF déjà déposé n'est jamais régénéré : c'est un document comptable figé.

## Formulaires admin

`ActionForm` (client) publie les erreurs par champ dans `IssuesContext` ; un
`<Field name="chemin.du.champ">` les affiche. Ne pas passer de fonction en enfant
depuis une page serveur : elle ne traverse pas la frontière serveur → client.

## Ports locaux

Firestore émulé sur **8180** (8080 est pris par OrbStack sur cette machine) ;
auth 9099, storage 9199, UI 4000.
