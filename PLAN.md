# Mon Vrai — plan de construction

Site autonome remplaçant la boutique Shopify. Design : projet Claude Design
« Mon Vrai - Propositions » (variantes 2a, 3a, 4a, 4b, 5a, 6a, 7c).

## Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | Rendu serveur (SEO des fiches), Server Actions pour l'admin, cible native d'App Hosting |
| Hébergement | Firebase App Hosting (Cloud Run) | CDN, TLS, montée en charge, `minInstances: 1` pour les webhooks |
| Données | Firestore | Choix de Steve. Transactions pour le stock et la numérotation ; export BigQuery pour le reporting |
| Auth | Firebase Auth + cookie de session serveur | Comptes clients, rôle admin par *custom claim* |
| Médias | Cloud Storage | Envoi via le serveur uniquement |
| Paiement | Stripe Checkout + webhooks | PCI et 3-D Secure délégués ; Stripe Tax pour la TVA |
| E-mails | Resend | Simple ; journalisation locale si pas de clé |
| WYSIWYG | Tiptap | Headless, JSON + HTML |
| Styles | Tailwind 4 + jetons de la maquette | Montserrat, palette, arrondis 24/32 px |
| Tests | Vitest | Logique métier pure |

Développement 100 % sur les **émulateurs Firebase** : aucun accès réel requis.

## Modèle de données (Firestore)

```
settings/site        annonce, réseaux, coordonnées, seuil livraison offerte, SEO par défaut
menus/header         items: [{ label, kind: page|system|url, ref, children[] }]
menus/footer         idem, avec colonnes
pages/{slug}         title, body { json, html }, status, seo, updatedAt
products/{slug}      title, ageLabel, subtitle, description, items[], price, compareAt,
                     images[], badge (new|reissue|none), preorder { enabled, shipFrom },
                     stock, isbn, tint, position, status, seo
customers/{uid}      email, name, addresses[], stripeCustomerId, createdAt
carts/{cartId}       lines[{ productSlug, qty }], updatedAt      (cookie côté client)
orders/{id}          number, status, lines[], totals, customer, shipping, stripe{},
                     invoiceNumber, invoiceUrl, timeline[], createdAt
counters/orders      seq
counters/invoices    seq  — séquentiel sans trou, incrémenté en transaction
media/{id}           path, url, alt, width, height, mime, createdAt
audit/{id}           who, what, target, at
```

### Pages système (cibles possibles d'un menu)

`home` · `catalogue` · `search` · `cart` · `account` · `contact` · `policies`
Une page créée dans l'admin est ciblée par son slug.

### États d'une commande

`pending_payment → paid → preparing → shipped → delivered`
Branches : `cancelled`, `refunded`. Chaque transition est journalisée dans `timeline[]`.

## Étapes

Chaque étape se termine par une vérification contre les émulateurs et, pour le
front, une capture desktop + mobile.

1. **Socle** — scaffold, jetons de design, Firebase admin/client, émulateurs, seed. ✅ en cours
2. **Contenu importé** — produits, images, politiques exportés de Shopify → seed.
3. **Site public** — layout (annonce, en-tête, pied), accueil 2a, catalogue 3a,
   fiche produit, recherche 6a, notre histoire 4a, contact 4b, pages légales 7c, pages libres.
4. **Panier** — panier serveur (cookie), page 5a, jauge livraison offerte, suggestions.
5. **Comptes** — inscription, connexion, session cookie, espace client (commandes).
6. **Back-office** — Pages (Tiptap), Menus, Produits, Commandes, Clients, Médias, Réglages.
7. **Paiement** — Stripe Checkout, webhook idempotent, création de commande en transaction
   (stock + numéro), e-mail de confirmation.
8. **Conformité** — factures PDF numérotées, Stripe Tax, bandeau cookies, export/suppression RGPD.
9. **Mise en ligne** — redirections 301 depuis les URLs Shopify, DNS, Secret Manager, sauvegardes.

## Ce qui reste à Steve à chaque étape

| Étape | À faire de ton côté |
|---|---|
| 1 | Rien. |
| 5 | Créer le projet Firebase prod, activer Auth (e-mail + Google). |
| 7 | Compte Stripe (KYC), clés test puis live. |
| 8 | Validation TVA/OSS et mentions de facture par le comptable. Contrats transporteurs. |
| 9 | DNS (SPF/DKIM/DMARC, domaine), Secret Manager, décision de bascule. |

## Hors périmètre volontaire

Pas de constructeur de pages par glisser-déposer, pas de thèmes, pas d'extensions.
Un petit CMS, pas un WordPress.
