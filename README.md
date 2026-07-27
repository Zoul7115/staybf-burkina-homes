# YiriGo

Plateforme de réservation d'hébergements vérifiés au Burkina Faso. Paiement mobile money (Orange Money, Moov Money), hôtes certifiés, messagerie intégrée.

## Projet Supabase

| | |
|---|---|
| **Project Ref** | `infxvfvzhvtdnyuayywe` |
| **URL** | `https://infxvfvzhvtdnyuayywe.supabase.co` |

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend / SSR | TanStack Start (React 19, Vite 6) |
| Routeur | TanStack Router |
| Backend | Supabase (PostgreSQL 15, RLS, Edge Functions Deno) |
| Paiement | GaniPay (HMAC-SHA256 webhooks) |
| Stockage | Supabase Storage (6 buckets) |
| Email | Resend via Edge Function `send-email` |
| Hébergement | Netlify (SSR via nitro preset) |
| Tests | Vitest |

## Prérequis

- Node.js ≥ 20
- npm ≥ 10
- Supabase CLI (pour les migrations locales)
- Compte Netlify
- Compte Supabase

## Installation locale

```bash
npm install
cp .env.example .env.local
# Renseigner les variables dans .env.local (anon key, service role key, etc.)
npm run dev
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement (Vite, port 5173) |
| `npm run build:netlify` | Build SSR pour Netlify |
| `npm run typecheck` | Vérification TypeScript (`tsc --noEmit`) |
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | ESLint |
| `npm run validate:config` | Validation des variables d'environnement |
| `npm run db:types` | Génération des types Supabase |

## Variables d'environnement

Voir `.env.example` pour la liste complète. Les URLs Supabase sont pré-renseignées.

Les variables `VITE_*` sont publiques (bundlées dans le client). Toutes les autres sont server-only.

## Base de données

21 migrations dans `supabase/migrations/`, à appliquer dans l'ordre numérique :

```bash
supabase link --project-ref infxvfvzhvtdnyuayywe
supabase db push
```

Voir `CHANGELOG.md` pour le détail des corrections de compatibilité PostgreSQL 15 / Supabase Cloud.

## Edge Functions (Supabase)

40 fonctions Deno dans `supabase/functions/`. Déploiement :

```bash
supabase functions deploy --project-ref infxvfvzhvtdnyuayywe
```

## Storage

6 buckets à provisionner via le script idempotent :

```bash
SUPABASE_URL=https://infxvfvzhvtdnyuayywe.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
./scripts/create-buckets.sh
```

Buckets publics : `property-images`, `room-images`, `avatars`  
Buckets privés : `message-attachments`, `ticket-attachments`, `kyc-documents`

## CI/CD

| Workflow | Déclencheur | Action |
|---|---|---|
| `.github/workflows/ci.yml` | Push / PR | Typecheck + Build + Tests |
| `.github/workflows/deploy.yml` | Push `main` | Build + Deploy Netlify |
| `.github/workflows/migrations.yml` | Push `main` sur `supabase/migrations/**` | `supabase db push` + `supabase functions deploy` |

Secrets GitHub requis : voir `ENV_PRODUCTION.md`.

## Architecture paiement

GaniPay — flux webhook-first :

1. Frontend appelle `payment-init` → obtient URL de paiement
2. Utilisateur paie sur la page GaniPay
3. GaniPay envoie webhook → `payment-webhook` (HMAC-SHA256 vérifié)
4. `payment-webhook` met à jour le booking et déclenche les notifications
5. `retry-webhooks` (pg_cron, toutes les 5 min) relance les webhooks échoués via l'en-tête interne `X-YiriGo-Internal-Retry`

## Licence

Propriétaire — tous droits réservés.
