# Mon Vrai — site

Boutique autonome des imagiers Mon Vrai (Next.js 16, Firebase App Hosting, Firestore,
Stripe). Plan de construction et modèle de données : [`PLAN.md`](./PLAN.md).

## Démarrer en local

Aucun accès Firebase ou Stripe n'est nécessaire : tout tourne sur les émulateurs.

```bash
pnpm install
cp .env.example .env.local        # puis ajouter NEXT_PUBLIC_USE_EMULATORS=1
pnpm emulators                    # Firestore, Auth, Storage — interface sur :4000
pnpm seed                         # dans un autre terminal : contenu réel importé de Shopify
pnpm dev                          # http://localhost:3000
```

Compte admin de développement : `admin@monvrai.local` / `admin-local-only` (voir `.env.example`).

## Vérifier

```bash
pnpm check    # typecheck + lint + tests unitaires
```

## Contenu importé

`content/shopify-export/` contient l'export brut de l'ancienne boutique : les 9 produits
(`products.raw.json`), leurs 20 photos (`images/`), les 7 politiques (`policies.json`) et
les photos d'ambiance de la maquette (`media/`). Le seed part de là. Ce dossier est la
seule copie hors Shopify : il est versionné volontairement, images comprises.

## Déployer

App Hosting lit `apphosting.yaml`. Les secrets (Stripe, Resend, cookie de session) vont
dans Secret Manager, jamais dans le dépôt. Étapes détaillées dans `PLAN.md`, section 9.
