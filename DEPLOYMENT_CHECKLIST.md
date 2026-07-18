# DEPLOYMENT_CHECKLIST.md — StayBF Burkina Homes

> Déploiement cible : Netlify (frontend + SSR) + Supabase (BDD + Edge Functions)  
> Prérequis : Compte Netlify, compte Supabase, compte GaniPay production, compte Resend

---

## Vue d'ensemble

```
[GitHub] ──push──► [Netlify Build] ──► [dist/client/] static
                                   ──► [dist/server/server.mjs] Function v2
         ──────► [Supabase] ──► [PostgreSQL] migrations appliquées
                            ──► [Edge Functions] 40 fonctions déployées
                            ──► [Storage] 6 buckets provisionnés
```

---

## Phase 0 — Prérequis

```
[ ] 0.1  Compte Supabase créé et projet production initialisé
[ ] 0.2  Compte Netlify connecté au repository GitHub zoul7115/staybf-burkina-homes
[ ] 0.3  Compte GaniPay production activé (clés API + webhook configuré)
[ ] 0.4  Compte Resend.com créé, domaine staybf.com vérifié pour l'envoi d'emails
[ ] 0.5  CLI Supabase installée localement : npm i -g supabase
[ ] 0.6  Fichier .env.production rempli à partir de .env.example (ne jamais commiter)
```

---

## Phase 1 — Base de données Supabase

### 1.1 Connexion et vérification

```bash
# Authentification CLI
supabase login --token $SUPABASE_ACCESS_TOKEN

# Lier le projet
supabase link --project-ref $SUPABASE_PROJECT_REF

# Vérifier la connexion
supabase db ping
```

```
[ ] 1.1  CLI Supabase authentifiée et liée au projet production
```

### 1.2 Application des 21 migrations

```bash
# Prévisualiser (dry-run)
supabase db push --dry-run

# Appliquer toutes les migrations
supabase db push
```

```
[ ] 1.2a  Migration 0001_init_identity          — Extensions, profiles, user_roles, triggers
[ ] 1.2b  Migration 0002_reference_data         — Régions, villes, amenities, plans abonnement
[ ] 1.2c  Migration 0003_catalog               — Properties, rooms, images, RLS
[ ] 1.2d  Migration 0004_availability          — room_availability, seasonal_pricing, blocked_dates
[ ] 1.2e  Migration 0005_booking_engine        — Bookings, state machine, events
[ ] 1.2f  Migration 0006_payments              — Payments, payouts, refunds
[ ] 1.2g  Migration 0007_engagement            — Favorites, reviews, messages, notifications
[ ] 1.2h  Migration 0008_operations_support    — Support tickets, audit_logs (partitionné)
[ ] 1.2i  Migration 0009_analytics_automation  — analytics_events, cron jobs (16 jobs)
[ ] 1.2j  Migration 0009a_audit_fixes          — Corrections 5 cron jobs cassés
[ ] 1.2k  Migration 0010_storage_infrastructure — RLS storage, virus scan, 4 cron jobs
[ ] 1.2l  Migration 0011_realtime_extension    — 8 tables en publication Realtime
[ ] 1.2m  Migration 0012_financial_infrastructure — wallet_ledger, webhook_logs, idempotency_keys
[ ] 1.2n  Migration 0013_ledger_entry_number   — Numérotation WL-XXXXXXXXX
[ ] 1.2o  Migration 0014_platform_settings     — KV table paramètres admin
[ ] 1.2p  Migration 0015_fix_payout_batch      — Fix JOIN process_payout_batch
[ ] 1.2q  Migration 0016_column_level_security — Triggers anti-escalation privilèges
[ ] 1.2r  Migration 0017_withdrawal_state_machine — 7-état machine retrait
[ ] 1.2s  Migration 0018_ganipay_provider      — provider CHECK étendu ganipay
[ ] 1.2t  Migration 0019_fix_webhook_logs_provider — Fix constraint bloquant GaniPay
[ ] 1.2u  Migration 0020_rc2_atomic_withdrawal — create_withdrawal_atomic (advisory lock)
```

### 1.3 Vérification post-migration

```bash
# Vérifier que toutes les tables existent
supabase db query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" 

# Vérifier les jobs pg_cron
supabase db query "SELECT jobname, schedule FROM cron.job ORDER BY jobname;"

# Compter les politiques RLS
supabase db query "SELECT count(*) FROM pg_policies;"
```

```
[ ] 1.3a  Tables principales créées (≥ 40 tables attendues)
[ ] 1.3b  20 jobs pg_cron enregistrés
[ ] 1.3c  ≥ 164 politiques RLS créées
[ ] 1.3d  RLS activé et FORCE sur toutes les tables critiques
```

---

## Phase 2 — Storage Buckets

### 2.1 Provisionnement des 6 buckets

```bash
# S'assurer que les variables sont exportées
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Exécuter le script de provisionnement (idempotent)
./scripts/create-buckets.sh

# Dry-run si besoin de prévisualiser
DRY_RUN=1 ./scripts/create-buckets.sh
```

```
[ ] 2.1a  Bucket property-images  (public,  5 MB max, JPEG/PNG/WebP/AVIF)
[ ] 2.1b  Bucket room-images      (public,  5 MB max, JPEG/PNG/WebP/AVIF)
[ ] 2.1c  Bucket avatars          (public,  2 MB max, JPEG/PNG/WebP/GIF)
[ ] 2.1d  Bucket message-attachments (privé, 20 MB max, images + PDF + vidéo)
[ ] 2.1e  Bucket ticket-attachments  (privé, 20 MB max, images + PDF)
[ ] 2.1f  Bucket kyc-documents       (privé, 10 MB max, JPEG/PNG/PDF)
```

### 2.2 Vérification

```bash
# Lister les buckets créés
curl -s "${SUPABASE_URL}/storage/v1/bucket" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool | grep '"name"'
```

```
[ ] 2.2  Les 6 buckets sont visibles dans Dashboard → Storage
```

---

## Phase 3 — Edge Functions

### 3.1 Configuration des secrets

```bash
# Secrets obligatoires — à définir AVANT le déploiement des fonctions
supabase secrets set \
  APP_URL="https://staybf.com" \
  GANIPAY_API_KEY="gp_live_xxxx" \
  GANIPAY_ENV="production" \
  GANIPAY_WEBHOOK_SECRET="whsec_xxxx" \
  PAYMENT_WEBHOOK_SECRET="whsec_xxxx" \
  GANIPAY_CALLBACK_URL="https://staybf.com/booking/confirmation" \
  GANIPAY_CANCEL_URL="https://staybf.com/checkout" \
  RESEND_API_KEY="re_xxxx" \
  LIBSODIUM_SEALED_BOX_PUBLIC_KEY="base64==" \
  LIBSODIUM_SEALED_BOX_PRIVATE_KEY="base64=="

# Secrets conditionnels (si SMS/WhatsApp activés)
supabase secrets set \
  TWILIO_ACCOUNT_SID="ACxxxx" \
  TWILIO_AUTH_TOKEN="xxxx" \
  TWILIO_SMS_FROM="+22600000000" \
  TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"

# ⛔ Ne PAS setter en production :
# SIMULATE_PAYMENT_ENABLED=true
```

```
[ ] 3.1  Tous les secrets obligatoires configurés dans Supabase
[ ] 3.2  SIMULATE_PAYMENT_ENABLED absent ou = false
```

### 3.2 Déploiement des 40 Edge Functions

```bash
# Déployer toutes les fonctions en une commande
supabase functions deploy --no-verify-jwt

# Ou déployer individuellement si besoin de contrôle :
for fn in approve-booking approve-property approve-withdrawal \
          calculate-booking-price cancel-booking complete-withdrawal \
          create-booking create-payment-intent create-property create-review \
          create-support-ticket delete-image delete-room dispatch-withdrawal \
          export-csv generate-pdf payment-init payment-status payment-webhook \
          payout-dispatch payout-status process-payment-webhook process-withdrawal \
          refund-payment reject-booking reject-property reject-withdrawal \
          retry-payment retry-webhooks send-email send-notification \
          send-sms send-whatsapp simulate-payment sync-ical update-property \
          upload-avatar upload-property-image upload-room-image write-ledger-entry; do
  supabase functions deploy $fn
  echo "✓ $fn déployée"
done
```

```
[ ] 3.3a  approve-booking          déployée
[ ] 3.3b  approve-property         déployée
[ ] 3.3c  approve-withdrawal       déployée
[ ] 3.3d  calculate-booking-price  déployée
[ ] 3.3e  cancel-booking           déployée
[ ] 3.3f  complete-withdrawal      déployée
[ ] 3.3g  create-booking           déployée
[ ] 3.3h  create-payment-intent    déployée
[ ] 3.3i  create-property          déployée
[ ] 3.3j  create-review            déployée
[ ] 3.3k  create-support-ticket    déployée
[ ] 3.3l  delete-image             déployée
[ ] 3.3m  delete-room              déployée
[ ] 3.3n  dispatch-withdrawal      déployée
[ ] 3.3o  export-csv               déployée
[ ] 3.3p  generate-pdf             déployée
[ ] 3.3q  payment-init             déployée
[ ] 3.3r  payment-status           déployée
[ ] 3.3s  payment-webhook          déployée  ← URL à enregistrer dans GaniPay
[ ] 3.3t  payout-dispatch          déployée
[ ] 3.3u  payout-status            déployée
[ ] 3.3v  process-payment-webhook  déployée
[ ] 3.3w  process-withdrawal       déployée
[ ] 3.3x  refund-payment           déployée
[ ] 3.3y  reject-booking           déployée
[ ] 3.3z  reject-property          déployée
[ ] 3.3aa reject-withdrawal        déployée
[ ] 3.3ab retry-payment            déployée
[ ] 3.3ac retry-webhooks           déployée
[ ] 3.3ad send-email               déployée
[ ] 3.3ae send-notification        déployée
[ ] 3.3af send-sms                 déployée
[ ] 3.3ag send-whatsapp            déployée
[ ] 3.3ah simulate-payment         déployée
[ ] 3.3ai sync-ical                déployée
[ ] 3.3aj update-property          déployée
[ ] 3.3ak upload-avatar            déployée
[ ] 3.3al upload-property-image    déployée
[ ] 3.3am upload-room-image        déployée
[ ] 3.3an write-ledger-entry       déployée
```

### 3.3 Enregistrement du webhook GaniPay

```bash
# URL du webhook payment-webhook (généré automatiquement par Supabase)
WEBHOOK_URL="https://<ref>.supabase.co/functions/v1/payment-webhook"
echo "À enregistrer dans GaniPay Dashboard → Webhooks : $WEBHOOK_URL"
```

```
[ ] 3.4  URL https://<ref>.supabase.co/functions/v1/payment-webhook enregistrée dans GaniPay
[ ] 3.5  Événements GaniPay à activer : payment.captured, payment.failed, payment.cancelled,
         payment.refunded, payout.paid, payout.failed
```

---

## Phase 4 — Netlify

### 4.1 Variables d'environnement Netlify

Dans Netlify → Site settings → Environment variables :

```
[ ] 4.1a  VITE_SUPABASE_URL         = https://<ref>.supabase.co
[ ] 4.1b  VITE_SUPABASE_ANON_KEY    = eyJ...
[ ] 4.1c  VITE_MEDIA_BASE_URL       = https://<ref>.supabase.co
           (ou https://media.staybf.com si CNAME configuré)
[ ] 4.1d  NODE_VERSION              = 22  (déjà dans netlify.toml, confirmation)
```

### 4.2 Build et déploiement

```bash
# Déclencher manuellement si besoin (sinon automatique sur push)
netlify deploy --prod --build

# Vérifier le build localement avant push
NETLIFY=true NITRO_PRESET=netlify npm run build:netlify
```

```
[ ] 4.2a  Build Netlify réussi (commande : npm run build:netlify)
[ ] 4.2b  dist/client/ publié sur CDN Netlify
[ ] 4.2c  dist/server/server.mjs déployé en Netlify Function v2
[ ] 4.2d  config = { path: "/*", preferStatic: true } présent dans server.mjs
```

### 4.3 Vérification post-déploiement Netlify

```
[ ] 4.3a  https://staybf.com répond HTTP 200
[ ] 4.3b  https://staybf.com/auth/login accessible
[ ] 4.3c  https://staybf.com/search accessible
[ ] 4.3d  Headers de sécurité présents (HSTS, CSP, X-Frame-Options)
[ ] 4.3e  Redirection HTTP → HTTPS fonctionnelle
[ ] 4.3f  Redirection www → apex fonctionnelle
```

---

## Phase 5 — Vérification Supabase Auth

```bash
# Vérifier la configuration Auth dans le dashboard Supabase
# Dashboard → Authentication → Settings
```

```
[ ] 5.1  Site URL = https://staybf.com
[ ] 5.2  Redirect URLs inclut https://staybf.com/auth/callback
[ ] 5.3  Email confirmation activée (recommandé en prod)
[ ] 5.4  Rate limiting Auth activé
[ ] 5.5  CAPTCHA activé si souhaité
```

---

## Phase 6 — Vérification DNS

```
[ ] 6.1  DNS staybf.com → Netlify (A record ou CNAME)
[ ] 6.2  DNS www.staybf.com → staybf.com (CNAME ou redirect)
[ ] 6.3  Certificat TLS/SSL actif sur Netlify (Let's Encrypt automatique)
[ ] 6.4  (Optionnel) DNS media.staybf.com → <ref>.supabase.co (CDN images)
```

---

## Phase 7 — Smoke Test Post-Déploiement

```bash
BASE="https://staybf.com"

# Vérifier la page d'accueil
curl -sf "$BASE" | grep -q "Burkina" && echo "✓ Home OK" || echo "✗ Home FAIL"

# Vérifier la page login
curl -sf "$BASE/auth/login" | grep -q "Connexion\|email\|login" && echo "✓ Login OK" || echo "✗ Login FAIL"

# Vérifier les headers de sécurité
curl -sI "$BASE" | grep -i "strict-transport\|x-frame\|content-security"

# Tester le webhook (curl + faux payload)
curl -X POST "https://<ref>.supabase.co/functions/v1/payment-webhook" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' \
  | grep -q "signature\|Unauthorized" && echo "✓ Webhook auth OK"
```

```
[ ] 7.1  Page d'accueil répond 200 avec contenu StayBF
[ ] 7.2  /auth/login accessible et formulaire présent
[ ] 7.3  /search accessible
[ ] 7.4  Headers de sécurité présents (HSTS, CSP, X-Frame-Options, X-Content-Type)
[ ] 7.5  Webhook payment-webhook rejette les requêtes sans signature valide (401/403)
[ ] 7.6  Test paiement simulé depuis /admin (admin connecté requis)
[ ] 7.7  Vérifier que les ledger entries sont créées en BDD après test paiement
```

---

## Phase 8 — Monitoring

```
[ ] 8.1  Configurer Netlify Analytics (ou équivalent)
[ ] 8.2  Vérifier que les 20 jobs pg_cron démarrent (observer scheduled_jobs table à J+1)
[ ] 8.3  (Recommandé) Configurer une alerte Slack/email sur les dead-letter webhooks :
         SELECT * FROM payment_webhook_logs WHERE dead_lettered = true;
[ ] 8.4  (Recommandé) Uptime monitoring sur https://staybf.com/health ou /
[ ] 8.5  (Recommandé) Sentry DSN configuré pour les erreurs frontend
```

---

## Rollback

En cas de problème post-déploiement :

```bash
# Rollback Netlify vers le déploiement précédent
netlify deploys --prod
netlify deploy --restore <deploy-id>

# Rollback migration Supabase (si applicable)
# ATTENTION : certaines migrations sont destructives. Toujours sauvegarder avant.
supabase db reset --linked  # réinitialise et réapplique les migrations depuis 0
```

---

## Checklist Finale GO / NO GO

```
[ ] Toutes les 21 migrations appliquées sans erreur
[ ] Les 6 buckets Storage provisionnés
[ ] Les 40 Edge Functions déployées
[ ] Tous les secrets obligatoires configurés
[ ] SIMULATE_PAYMENT_ENABLED absent ou false
[ ] GANIPAY_ENV = production
[ ] Build Netlify 100% succès
[ ] Smoke test post-déploiement : 7/7 verts
[ ] Webhook GaniPay enregistré et testé
[ ] DNS configuré et TLS actif
```

**Si toutes les cases sont cochées → GO ✅**

---

*Généré le 2026-07-18. À mettre à jour à chaque nouvelle migration ou Edge Function.*
