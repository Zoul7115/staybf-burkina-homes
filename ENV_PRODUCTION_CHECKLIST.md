# ENV_PRODUCTION_CHECKLIST.md — StayBF Variables d'Environnement Production

> Généré le : 2026-07-18  
> Source : analyse statique de `src/**/*.ts(x)` et `supabase/functions/**/*.ts`

---

## Où configurer chaque variable

| Contexte | Outil de configuration |
|---|---|
| **Frontend (VITE\_\*)** | Netlify → Site settings → Environment variables |
| **Edge Functions Supabase** | Supabase Dashboard → Project → Edge Functions → Secrets |
| **Scripts de déploiement** | Fichier `.env.production` (jamais commité) |

> ⚠️ Les variables **SUPABASE_URL**, **SUPABASE_ANON_KEY** et **SUPABASE_SERVICE_ROLE_KEY** sont injectées **automatiquement** par le runtime Supabase dans toutes les Edge Functions. Elles n'ont pas besoin d'être configurées manuellement dans les secrets Edge Functions — uniquement dans le frontend et les scripts de déploiement.

---

## A — Variables Frontend (Netlify Environment Variables)

Ces variables sont préfixées `VITE_` — elles sont bundlées dans le code JavaScript côté client. **Ne jamais y mettre de secrets.**

| Variable | Obligatoire | Exemple de valeur | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ Obligatoire | `https://abcdefghijkl.supabase.co` | URL publique du projet Supabase. Source : Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ Obligatoire | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Clé anonyme Supabase (publique, protégée par RLS). Source : Dashboard → Settings → API → anon key |
| `VITE_MEDIA_BASE_URL` | ✅ Obligatoire | `https://abcdefghijkl.supabase.co` | Base URL CDN pour les images (property-images, room-images, avatars). En prod avec CNAME media.staybf.com : `https://media.staybf.com` |

---

## B — Variables Edge Functions Supabase (Secrets)

Configurées dans : Supabase Dashboard → Edge Functions → Secrets (ou `supabase secrets set`)

### B1 — Supabase (auto-injectées par le runtime)

Ces variables sont automatiquement disponibles dans toutes les Edge Functions — **aucune configuration manuelle requise dans les Secrets Edge Functions**.

| Variable | Obligatoire | Valeur | Source |
|---|---|---|---|
| `SUPABASE_URL` | ✅ Auto | `https://abcdefghijkl.supabase.co` | Runtime Supabase (automatique) |
| `SUPABASE_ANON_KEY` | ✅ Auto | `eyJ...` | Runtime Supabase (automatique) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Auto | `eyJ...` | Runtime Supabase (automatique) |

### B2 — Application

| Variable | Obligatoire | Exemple | Description | Fonctions concernées |
|---|---|---|---|---|
| `APP_URL` | ✅ Obligatoire | `https://staybf.com` | URL canonique de l'application. Contrôle le header CORS `Access-Control-Allow-Origin`. Sans cette variable, CORS répond `*` (toutes origines). | Toutes les fonctions (via `_shared/cors.ts`) |
| `SIMULATE_PAYMENT_ENABLED` | ⛔ Prod = absent/false | `false` | Activer les paiements simulés (DEV uniquement). **Doit être `false` ou absent en production.** | `simulate-payment` |

### B3 — GaniPay (Mobile Money)

| Variable | Obligatoire | Exemple | Description | Fonctions concernées |
|---|---|---|---|---|
| `GANIPAY_API_KEY` | ✅ Obligatoire | `gp_live_xxxxxxxxxxxxxxxx` | Clé API GaniPay production. Source : GaniPay Merchant Dashboard → API Keys | `payment-init`, `payment-status`, `payout-dispatch`, `payout-status` |
| `GANIPAY_ENV` | ✅ Obligatoire | `production` | Environnement GaniPay. Valeurs : `sandbox` \| `production`. **Doit être `production` en prod.** | `payment-init`, `payment-status`, `payout-dispatch`, `payout-status` |
| `GANIPAY_WEBHOOK_SECRET` | ✅ Obligatoire | `whsec_xxxxxxxxxxxxxxxx` | Secret HMAC-SHA256 pour valider les webhooks entrants GaniPay. Source : GaniPay Dashboard → Webhooks → Signing secret | `payment-webhook` |
| `PAYMENT_WEBHOOK_SECRET` | ✅ Obligatoire | `whsec_xxxxxxxxxxxxxxxx` | Secret de validation pour le webhook générique (`process-payment-webhook`). Peut être identique à `GANIPAY_WEBHOOK_SECRET`. | `process-payment-webhook` |
| `GANIPAY_CALLBACK_URL` | ✅ Obligatoire | `https://staybf.com/booking/confirmation` | URL de redirection après paiement réussi. Doit être publiquement accessible. | `payment-init` |
| `GANIPAY_CANCEL_URL` | ✅ Obligatoire | `https://staybf.com/checkout` | URL de redirection après paiement annulé ou refusé. | `payment-init` |

### B4 — Email (Resend)

| Variable | Obligatoire | Exemple | Description | Fonctions concernées |
|---|---|---|---|---|
| `RESEND_API_KEY` | ✅ Obligatoire | `re_xxxxxxxxxxxxxxxx` | Clé API Resend.com pour l'envoi d'emails transactionnels (confirmation réservation, etc.). Source : resend.com → API Keys | `send-email` |

### B5 — SMS & WhatsApp (Twilio)

| Variable | Obligatoire | Exemple | Description | Fonctions concernées |
|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | ⚡ Si SMS/WA activé | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Account SID Twilio. Source : Twilio Console → Account Info | `send-sms`, `send-whatsapp` |
| `TWILIO_AUTH_TOKEN` | ⚡ Si SMS/WA activé | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Auth Token Twilio. Source : Twilio Console → Account Info | `send-sms`, `send-whatsapp` |
| `TWILIO_SMS_FROM` | ⚡ Si SMS activé | `+22600000000` | Numéro expéditeur SMS (Twilio phone number). Format E.164. | `send-sms` |
| `TWILIO_WHATSAPP_FROM` | ⚡ Si WA activé | `whatsapp:+14155238886` | Numéro expéditeur WhatsApp. Format `whatsapp:+<numéro>`. Source : Twilio Console → Messaging → Senders | `send-whatsapp` |

### B6 — Chiffrement (Libsodium — Sealed Box)

| Variable | Obligatoire | Exemple | Description | Usage |
|---|---|---|---|---|
| `LIBSODIUM_SEALED_BOX_PUBLIC_KEY` | ✅ Obligatoire | `base64encodedpublickey=` | Clé publique Libsodium (base64). Utilisée pour **chiffrer** `payout_account` et `document_number_enc`. Génération : voir `.env.example`. | Chiffrement KYC et payout |
| `LIBSODIUM_SEALED_BOX_PRIVATE_KEY` | ✅ Obligatoire | `base64encodedprivatekey=` | Clé privée Libsodium (base64). Utilisée pour **déchiffrer** uniquement. **Ne jamais exposer.** | Déchiffrement KYC et payout |

### B7 — Antivirus (optionnel pour MVP)

| Variable | Obligatoire | Exemple | Description |
|---|---|---|---|
| `ANTIVIRUS_API_URL` | ⚡ Recommandé | `https://www.virustotal.com/api/v3/files` | URL de l'API antivirus. Utilisée pour scanner les documents KYC uploadés. |
| `ANTIVIRUS_API_KEY` | ⚡ Recommandé | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Clé API VirusTotal (ou ClamAV en production). |

---

## C — Variables Scripts de Déploiement (`.env.production` local)

Ces variables ne sont utilisées que par les scripts Bash (`scripts/create-buckets.sh`, `scripts/set-db-secrets.sh`) et la CLI Supabase. **Ne pas mettre en production Netlify ni dans les secrets Edge Functions.**

| Variable | Obligatoire | Exemple | Description |
|---|---|---|---|
| `SUPABASE_URL` | ✅ Obligatoire | `https://abcdefghijkl.supabase.co` | URL du projet Supabase (même valeur que `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Obligatoire | `eyJ...` | Clé service_role (bypass RLS). Requise par `create-buckets.sh` pour l'API Storage Admin. |
| `SUPABASE_PROJECT_REF` | ✅ Obligatoire | `abcdefghijkl` | Référence courte du projet (12 chars). Utilisée par la CLI Supabase. Source : URL du dashboard. |
| `SUPABASE_ACCESS_TOKEN` | ✅ Obligatoire | `sbp_xxxx` | Personal Access Token Supabase CLI. Source : supabase.com → Account → Access Tokens |
| `SUPABASE_DB_URL` | ⚡ Pour migrations | `postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres` | Connexion directe PostgreSQL pour les migrations. |
| `SUPABASE_DB_POOLER_URL` | ⚡ Recommandé | `postgresql://postgres.<ref>:<pwd>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres` | PgBouncer (transaction mode) pour le serveur applicatif. |
| `SUPABASE_JWT_SECRET` | ⚡ Pour validation | `your-super-secret-jwt-token` | Secret JWT. Source : Dashboard → Settings → Auth → JWT Settings |

---

## D — Récapitulatif par priorité

### 🔴 Bloquantes — Sans ces variables, l'application ne fonctionne pas

1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`
3. `VITE_MEDIA_BASE_URL`
4. `APP_URL` (CORS)
5. `GANIPAY_API_KEY`
6. `GANIPAY_ENV` = `production`
7. `GANIPAY_WEBHOOK_SECRET`
8. `PAYMENT_WEBHOOK_SECRET`
9. `GANIPAY_CALLBACK_URL`
10. `GANIPAY_CANCEL_URL`
11. `RESEND_API_KEY`
12. `LIBSODIUM_SEALED_BOX_PUBLIC_KEY`
13. `LIBSODIUM_SEALED_BOX_PRIVATE_KEY`

### 🟡 Conditionnelles — Bloquantes si la fonctionnalité est activée

14. `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_SMS_FROM` (si SMS activé)
15. `TWILIO_WHATSAPP_FROM` (si WhatsApp activé)
16. `ANTIVIRUS_API_URL` + `ANTIVIRUS_API_KEY` (si scan antivirus KYC activé)

### ⛔ Interdites en production

17. `SIMULATE_PAYMENT_ENABLED` = `true` — doit être absent ou `false`

---

## E — Commande de génération des clés Libsodium

```bash
node -e "
const s = require('libsodium-wrappers');
s.ready.then(() => {
  const kp = s.crypto_box_keypair();
  console.log('LIBSODIUM_SEALED_BOX_PUBLIC_KEY=' + Buffer.from(kp.publicKey).toString('base64'));
  console.log('LIBSODIUM_SEALED_BOX_PRIVATE_KEY=' + Buffer.from(kp.privateKey).toString('base64'));
});
"
```

---

*Document généré à partir de l'analyse statique du code source — à mettre à jour si de nouvelles Edge Functions sont ajoutées.*
