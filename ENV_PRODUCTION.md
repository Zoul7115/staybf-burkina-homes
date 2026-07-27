# YiriGo — Variables d'environnement de production

Ce document liste **toutes** les variables nécessaires au lancement en production.
Il couvre : Netlify, Supabase (Edge Functions), paiement GaniPay, et email Resend.

> **Règle absolue** : ne jamais commiter de valeur réelle dans ce fichier.  
> Les valeurs réelles se configurent dans les dashboards respectifs (voir colonne « Où »).

---

## 1. Variables Netlify

À configurer dans : **Netlify Dashboard → Site → Site configuration → Environment variables**

| Variable | Obligatoire | Exemple | Description |
|---|---|---|---|
| `APP_URL` | ✅ Oui | `https://yiri-go.com` | URL publique de l'application. Utilisé dans `auth.functions.ts` pour `emailRedirectTo` (signup) et `redirectTo` (reset password). **Doit correspondre exactement au domaine déployé.** |
| `VITE_SUPABASE_URL` | ✅ Oui | `https://infxvfvzhvtdnyuayywe.supabase.co` | URL publique du projet Supabase. Source : Dashboard Supabase → Settings → API. |
| `VITE_SUPABASE_ANON_KEY` | ✅ Oui | `eyJhbGciO...` | Clé anon/publique Supabase. Bundlée dans le navigateur. La RLS est la seule porte d'accès. |
| `VITE_MEDIA_BASE_URL` | ✅ Oui | `https://infxvfvzhvtdnyuayywe.supabase.co` | URL de base du CDN Storage pour les images (propriétés, chambres, avatars). En production, peut pointer vers un CNAME personnalisé. |
| `SUPABASE_URL` | ✅ Oui | `https://infxvfvzhvtdnyuayywe.supabase.co` | Miroir de `VITE_SUPABASE_URL` pour les server functions TanStack Start qui n'ont pas accès à `import.meta.env`. |
| `SUPABASE_ANON_KEY` | ✅ Oui | `eyJhbGciO...` | Miroir de `VITE_SUPABASE_ANON_KEY` pour les server functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Oui | `eyJhbGciO...` | Clé service_role — bypasse la RLS. Utilisée uniquement par `supabaseAdmin` dans `src/lib/supabase/admin.ts`. **Ne jamais exposer côté navigateur.** |
| `SUPABASE_JWT_SECRET` | ✅ Oui | `super-secret-jwt-...` | Secret JWT du projet Supabase. Source : Dashboard → Settings → Auth → JWT Settings. |
| `SUPABASE_DB_URL` | ⬜ Optionnel | `postgresql://postgres:pwd@db.ref.supabase.co:5432/postgres` | Connexion directe Postgres. Utilisée par les scripts de migration en CI/CD. Pas requise à runtime. |
| `SUPABASE_DB_POOLER_URL` | ⬜ Optionnel | `postgresql://postgres.ref:pwd@aws-0-eu-west-1.pooler.supabase.com:6543/postgres` | Connexion PgBouncer pour les queries runtime sous charge. |
| `SUPABASE_PROJECT_REF` | ⬜ Optionnel | `infxvfvzhvtdnyuayywe` | Référence courte du projet. Utilisée par `scripts/create-buckets.sh`. |
| `LIBSODIUM_SEALED_BOX_PUBLIC_KEY` | ✅ Oui | `base64encodedkey==` | Clé publique libsodium pour le chiffrement des comptes de virement (colonne `payout_account`). |
| `LIBSODIUM_SEALED_BOX_PRIVATE_KEY` | ✅ Oui | `base64encodedkey==` | Clé privée libsodium pour le déchiffrement. Garder hors de tout log. |

---

## 2. Variables Supabase Edge Functions

À configurer dans : **Supabase Dashboard → Edge Functions → Secrets** (ou via CLI : `supabase secrets set KEY=VALUE`)

> Ces variables sont lues par `Deno.env.get(...)` dans les Edge Functions.  
> **Elles sont distinctes des variables Netlify.**

### 2a. Supabase (accès interne entre Edge Functions)

| Variable | Obligatoire | Exemple | Description |
|---|---|---|---|
| `APP_URL` | ✅ Oui | `https://yiri-go.com` | Utilisé dans `_shared/cors.ts` : `ALLOWED_ORIGIN = APP_URL \|\| "*"`. Si absent, toutes les EF acceptent les requêtes depuis n'importe quel domaine (CORS wildcard). **Critique.** |
| `SUPABASE_URL` | ✅ Oui | `https://infxvfvzhvtdnyuayywe.supabase.co` | Injecté automatiquement par Supabase dans les EF. Vérifier qu'il est bien défini. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Oui | `eyJhbGciO...` | Injecté automatiquement par Supabase. Utilisé par `makeServiceClient()` dans `_shared/auth.ts`. |
| `SUPABASE_ANON_KEY` | ✅ Oui | `eyJhbGciO...` | Injecté automatiquement par Supabase. |

### 2b. Email — Resend

| Variable | Obligatoire | Exemple | Description | Où configurer |
|---|---|---|---|---|
| `RESEND_API_KEY` | ✅ Oui | `re_xxxxxxxxxxxxxxxx` | Clé API Resend. Utilisée par `send-email/index.ts` pour envoyer tous les emails transactionnels (confirmation, reset, notifications). **Si absente, tous les emails échouent silencieusement.** | Supabase → Edge Functions → Secrets |

> Source de la clé : [Resend Dashboard](https://resend.com/api-keys) → Create API Key → Production.

### 2c. SMS / WhatsApp (optionnel pour v1)

| Variable | Obligatoire | Description |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | ⬜ Optionnel | Utilisé par `send-sms` et `send-whatsapp` EF. Laisser vide en v1 si SMS désactivé. |
| `TWILIO_AUTH_TOKEN` | ⬜ Optionnel | Idem. |
| `TWILIO_PHONE_NUMBER` | ⬜ Optionnel | Idem. |
| `TWILIO_WHATSAPP_NUMBER` | ⬜ Optionnel | Idem. |

---

## 3. Variables paiement — GaniPay

À configurer dans : **Supabase Dashboard → Edge Functions → Secrets**

| Variable | Obligatoire | Exemple | Description |
|---|---|---|---|
| `GANIPAY_WEBHOOK_SECRET` | ✅ Oui | `whsec_xxxxxxxx` | Secret HMAC-SHA256 pour la vérification des webhooks GaniPay entrants. Utilisé dans `payment-webhook/index.ts`. **Si absent, tous les webhooks GaniPay sont rejetés (hard-fail) et aucun paiement n'est jamais confirmé.** |
| `GANIPAY_API_KEY` | ✅ Oui | `gp_live_xxxxxxxx` | Clé API GaniPay pour l'initiation des paiements (`payment-init/index.ts`). Source : Dashboard GaniPay → API Keys. |
| `GANIPAY_API_URL` | ✅ Oui | `https://api.ganipay.com/v1` | Base URL de l'API GaniPay. À ajuster si GaniPay fournit un endpoint distinct en production. |
| `GANIPAY_MERCHANT_ID` | ✅ Oui | `merchant_xxxxxxx` | Identifiant marchand GaniPay. |

> Comment obtenir ces valeurs : GaniPay Dashboard → Paramètres → API & Webhooks.  
> Le `GANIPAY_WEBHOOK_SECRET` est généré lors de la création du webhook endpoint dans le tableau de bord GaniPay.

---

## 4. Variables Resend — Configuration email

À configurer dans : **Resend Dashboard** puis clé dans Supabase Edge Functions Secrets

| Configuration | Obligatoire | Valeur / Action |
|---|---|---|
| **Domaine vérifié** | ✅ Oui | Ajouter `yiri-go.com` dans Resend → Domains → Add Domain. Ajouter les enregistrements DNS SPF, DKIM, DMARC chez le registrar. |
| **Adresse expéditeur** | ✅ Oui | `noreply@yiri-go.com` (expéditeur par défaut dans `send-email/index.ts`). Requiert le domaine vérifié ci-dessus. |
| **RESEND_API_KEY** | ✅ Oui | Voir section 2b — à configurer dans Supabase Edge Functions Secrets. |

---

## 5. Checklist de validation pré-lancement

Avant d'ouvrir le trafic public, vérifier **dans cet ordre** :

- [ ] `APP_URL` défini dans Netlify ET dans Supabase Edge Functions Secrets
- [ ] `GANIPAY_WEBHOOK_SECRET` défini dans Supabase Edge Functions Secrets
- [ ] `RESEND_API_KEY` défini dans Supabase Edge Functions Secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY` présent dans Netlify (pour les server functions)
- [ ] `LIBSODIUM_SEALED_BOX_PUBLIC_KEY` et `_PRIVATE_KEY` présents dans Netlify
- [ ] Domaine `yiri-go.com` vérifié dans Resend (SPF/DKIM/DMARC en place)
- [ ] URL du webhook GaniPay configurée dans le dashboard GaniPay : `https://infxvfvzhvtdnyuayywe.supabase.co/functions/v1/payment-webhook`
- [ ] Supabase Auth → Site URL = `https://yiri-go.com`
- [ ] Supabase Auth → Redirect URLs inclut `https://yiri-go.com/auth/callback`
- [ ] Test end-to-end : inscription → email → lien → `/auth/callback` → dashboard
- [ ] Test paiement sandbox GaniPay → webhook reçu → booking confirmé

---

*Document de référence interne — ne pas commiter les valeurs réelles.*
