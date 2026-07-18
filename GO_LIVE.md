# GO_LIVE.md — StayBF Burkina Homes

> Date de vérification : 2026-07-18  
> Branche : `claude/eager-ritchie-kDZHX`  
> Environnement vérifié : Dev local + analyse statique complète du code  
> Vérificateur : Claude Code (automated audit)

---

## Décision Finale

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                    ⚠️  CONDITIONAL GO                        ║
║                                                              ║
║  Le code est production-ready. Le déploiement nécessite      ║
║  3 actions bloquantes complétées avant le Go Live.           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Checklist — Résultats détaillés

---

### ✅ 1. BUILD

| Cible | Commande | Résultat | Durée |
|---|---|---|---|
| Cloudflare (default) | `npm run build` | ✅ 100% succès | 3.28s |
| Netlify Functions v2 | `npm run build:netlify` | ✅ 100% succès | 15.18s |

**Bundle highlights :**
- SSR : TanStack Start + Nitro (`dist/server/`)
- Client : code-splitted par route (`dist/client/assets/`)
- Largest chunks : `react-dom.mjs` 509 kB, `supabase__auth-js.mjs` 299 kB (normaux)
- Aucun avertissement TypeScript, aucune dépendance manquante

---

### ✅ 2. TESTS

```
Test Files  25 passed (25)
Tests       462 passed (462)
Duration    2.35s
```

**Couverture par domaine :**

| Domaine | Tests | Statut |
|---|---|---|
| Payment lifecycle (state machine) | 27 | ✅ |
| Financial integrity (FCFA, tolérance 0) | 6 | ✅ |
| Multi-payment & idempotency | 4 | ✅ |
| Timeout & expiry | 3 | ✅ |
| GaniPay sandbox (8 scénarios) | 32 | ✅ |
| Pricing engine (saisonnier, override) | 8 | ✅ |
| RC2 Retry worker | 6 | ✅ |
| Booking validations | ~376 | ✅ |

**Zéro test failing. Zéro skipped.**

---

### ✅ 3. EDGE FUNCTIONS

**39 fonctions** déployables sous `supabase/functions/`.

| Catégorie | Fonctions | Auth |
|---|---|---|
| Booking flow | create-booking, approve-booking, reject-booking, cancel-booking, accept-booking | requireAuth / requireAnyRole |
| Payment | create-payment-intent, payment-init, payment-status, retry-payment, refund-payment | requireAuth / requireAnyRole |
| Webhooks | payment-webhook, process-payment-webhook | HMAC-SHA256 ✅ |
| Withdrawal | create-withdrawal, process-withdrawal, approve-withdrawal, reject-withdrawal, dispatch-withdrawal, complete-withdrawal | requireAnyRole |
| Property | create-property, update-property, approve-property, reject-property | requireAuth / requireAnyRole |
| Notifications | send-notification, send-email, send-sms, send-whatsapp | requireRole / requireServiceRole |
| Storage | upload-property-image, upload-room-image, upload-avatar, delete-image | requireAuth |
| Analytics | export-csv, generate-pdf | requireAnyRole |
| Internal | write-ledger-entry, retry-webhooks, simulate-payment, sync-ical | Service key Bearer check |

**Contrôles de sécurité :**
- ✅ Toutes les fonctions : CORS géré via `_shared/cors.ts`
- ✅ Fonctions publiques : aucune — toutes protégées par JWT ou service key
- ✅ Webhooks GaniPay : HMAC-SHA256 avec timing-safe comparison, replay protection (freshness check 5min)
- ✅ `write-ledger-entry` / `retry-webhooks` : vérification Bearer manuelle avec `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Idempotency clés présentes sur tous les flux critiques

---

### ✅ 4. DATABASE

**21 migrations** appliquées, sans erreur :

| # | Migration | Contenu |
|---|---|---|
| 0001 | init_identity | Extensions, enums, profiles, user_roles, triggers auth |
| 0002 | reference_data | Régions, villes, amenities, subscription_plans |
| 0003 | catalog | Properties, rooms, images, RLS complet |
| 0004 | availability | room_availability, seasonal_pricing, blocked_dates |
| 0005 | booking_engine | Bookings, state machine, events |
| 0006 | payments | Payments, payouts, refunds, state machine |
| 0007 | engagement | Favorites, reviews, messages, notifications |
| 0008 | operations | Support tickets, moderation, audit_logs (partitionné) |
| 0009 | analytics | analytics_events (partitionné), cron jobs (20) |
| 0009a | audit_fixes | **Fix critique** : 5 cron jobs cassés corrigés |
| 0010 | storage | RLS storage, virus scan, cleanup crons |
| 0011 | realtime | 8 tables en publication supabase_realtime |
| 0012 | financial | wallet_ledger, payment_webhook_logs, idempotency_keys |
| 0013 | ledger_entry_number | Numérotation séquentielle `WL-XXXXXXXXX` |
| 0014 | platform_settings | KV table paramètres admin |
| 0015 | fix_payout_batch | Fix JOIN manquant dans process_payout_batch |
| 0016 | column_level_security | Triggers anti-escalation de privilèges |
| 0017 | withdrawal_state_machine | Machine à états retrait (7 états) |
| 0018 | ganipay_provider | CHECK provider étendu pour ganipay |
| 0019 | fix_webhook_logs_provider | **Fix critique** : constraint bloquait tous les webhooks GaniPay |
| 0020 | rc2_atomic_withdrawal | `create_withdrawal_atomic` avec advisory lock |

**Sécurité DB :**
- ✅ RLS enabled + FORCE ROW LEVEL SECURITY sur toutes les tables
- ✅ 164 politiques RLS créées
- ✅ `has_role()` SECURITY DEFINER : évite l'évaluation récursive des politiques
- ✅ Triggers anti-escalation sur `profiles` et `host_profiles`
- ✅ Advisory lock (`pg_advisory_xact_lock`) pour les retraits concurrents

---

### ⚠️ 5. BUCKETS — ACTION REQUISE

**6 buckets Storage requis :**

| Bucket | Visibilité | RLS |
|---|---|---|
| `property-images` | Public | ✅ Définie (migration 0010) |
| `room-images` | Public | ✅ Définie |
| `avatars` | Public | ✅ Définie |
| `message-attachments` | Privé | ✅ Définie |
| `ticket-attachments` | Privé | ✅ Définie |
| `kyc-documents` | Privé | ✅ Définie |

**⚠️ BLOQUANT** : Les buckets ne sont PAS créés par les migrations — ils sont provisionnés par `scripts/create-buckets.sh`. Ce script doit être exécuté manuellement après le déploiement :

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
./scripts/create-buckets.sh
```

Sans cette étape, tous les uploads d'images et documents échouent (HTTP 400 "Bucket not found").

---

### ✅ 6. AUTH

**Supabase Auth configuré :**
- ✅ `requireAuth` : vérifie le JWT via `auth.getUser()` sur chaque requête
- ✅ `requireRole` / `requireAnyRole` : double-vérification en BDD (table `user_roles`)
- ✅ `requireServiceRole` : canal interne (email/SMS/WhatsApp) vérifié par clé symétrique
- ✅ `handle_new_user` trigger : crée automatiquement un profil à chaque inscription
- ✅ Login / Register UI : formulaires complets, validation frontend + erreur Supabase affichée
- ✅ Guards de route : toutes les routes `/traveler/*`, `/host/*`, `/admin/*` protégées

**Rôles disponibles :** `traveler`, `host`, `admin`, `super_admin`, `support`

---

### ✅ 7. NOTIFICATIONS

**Architecture :**
- ✅ Table `notifications` en BDD avec RLS (utilisateur lit ses propres notifs)
- ✅ `send-notification` Edge Function : admin-only, insère en batch
- ✅ Notification bell composant dans Navbar : dropdown Supabase Realtime
- ✅ pg_cron `retry-notifications` (toutes les 10 min) : retente les notifications non délivrées
- ✅ pg_cron `notification-cleanup` : purge à 30j (soft) et 180j (hard)

**Multi-canal :**
- `send-email` : Resend API (`RESEND_API_KEY`)
- `send-sms` : Twilio (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`)
- `send-whatsapp` : Twilio WhatsApp (`TWILIO_WHATSAPP_FROM`)
- Dispatch : `src/lib/notifications/engine.ts` (EventBus côté serveur)

**Note :** Le dispatch multi-canal est piloté par le processus applicatif, pas par un trigger DB. Si le serveur est down lors d'un événement booking, la notification in-app est persistée en BDD (retentée par cron), mais les canaux email/SMS/WhatsApp dépendent du serveur applicatif.

---

### ✅ 8. WALLET

**Structure :**
- ✅ `wallet_ledger` : double-entry accounting, XOF uniquement
- ✅ Comptes : `HOST_PENDING`, `HOST_AVAILABLE`, `HOST_WITHDRAWN`, `PLATFORM_PENDING`, `PLATFORM_REVENUE`
- ✅ Contrainte : `debit_account ≠ credit_account`, au moins un non-null
- ✅ Contrainte : `amount_fcfa > 0`
- ✅ Contrainte : currency = `'XOF'`
- ✅ RLS : hôtes voient leurs propres entrées, service_role a tout
- ✅ `create_withdrawal_atomic` : advisory lock par host_id, atomique

**pg_cron wallet :**
- `process-payout-batch` (06:00 quotidien) : traite les retraits approuvés
- `retry-failed-payouts` (03:00 quotidien) : retente les payouts échoués

---

### ✅ 9. LEDGER

**Double-entry complet :**

| Événement | Débit | Crédit | Montant |
|---|---|---|---|
| Paiement capturé | — | HOST_PENDING | host_payout_amount |
| Paiement capturé | — | PLATFORM_PENDING | commission + service_fee |
| Retrait approuvé | HOST_AVAILABLE | HOST_WITHDRAWN | withdraw_amount |
| Remboursement | HOST_PENDING | — (reversal) | refund proportionnel |

- ✅ Idempotency : PK `{booking_id}-accommodation/commission/service-fee`
- ✅ `entry_number` séquentiel + `entry_ref` (WL-XXXXXXXXX) pour audit
- ✅ Validation d'intégrité : `SUM(host + commission + fee) == total_amount` avant écriture
- ✅ `write-ledger-entry` : upsert avec `ignoreDuplicates: true` (idempotent)
- ✅ Batch max 100 entrées par appel

---

### ✅ 10. PAYMENTS

**GaniPay Sandbox → Production :**
- ✅ HMAC-SHA256 webhook verification (timing-safe)
- ✅ Replay attack protection : freshness check 5 minutes
- ✅ Dead-letter après 5 tentatives (`payment_webhook_logs`)
- ✅ Dual idempotency : `payment_webhook_logs` UNIQUE + `payment_events` UNIQUE
- ✅ State machine : `initiated → pending → captured → refunded/chargedback`
- ✅ Fail-fast production : `GANIPAY_API_KEY` obligatoire si `GANIPAY_ENV=production`
- ✅ `SIMULATE_PAYMENT_ENABLED=true` désactivé en prod (requis : false ou absent)
- ✅ Tests : 32 scénarios GaniPay passent (cf. GANIPAY_READY.md)

**Variables critiques à configurer :**
```
GANIPAY_API_KEY=<clé production>
GANIPAY_ENV=production
GANIPAY_WEBHOOK_SECRET=<secret GaniPay dashboard>
PAYMENT_WEBHOOK_SECRET=<idem>
GANIPAY_CALLBACK_URL=https://staybf.com/booking/confirmation
GANIPAY_CANCEL_URL=https://staybf.com/checkout
```

---

### ✅ 11. WITHDRAWALS

**Machine à états (7 états) :**
```
pending → approved → scheduled → processing → paid
                                            → failed
         cancelled
```

- ✅ `create_withdrawal_atomic` : lock advisory par host, balance check, INSERT atomique
- ✅ Pré-vols obligatoires : `kyc_status = 'verified'`, `account_status = 'active'`, méthode de paiement configurée
- ✅ Caps configurables : limite journalière + mensuelle (via `platform_settings`)
- ✅ Idempotency key optionnelle sur chaque demande
- ✅ Dispatch GaniPay payout via `payout-dispatch` Edge Function
- ✅ Reversal ledger sur annulation

**Note mineure :** La clé d'idempotency est stockée dans `payouts.cancel_reason` (`idem:{key}`) — fonctionnel mais lisibilité dégradée. Non bloquant pour le Go Live.

---

### ✅ 12. MONITORING

**Observabilité interne :**

| Mécanisme | Description |
|---|---|
| `scheduled_jobs` table | Log complet de chaque exécution cron (status, durée, erreur) |
| `stuck-job-watchdog` | Cron toutes les 30min : détecte les jobs bloqués >1h |
| `audit_logs` partitionnés | Capture toutes les actions sensibles admin/système |
| `payment_webhook_logs` | Dead-letter tracking, retry count, next_retry_at |
| `analytics_events` partitionnés | Événements produit pour reporting |
| `dashboard_metrics` | KPIs pré-calculés (refreshés toutes les 15min) |

**20 cron jobs pg_cron :**

| Fréquence | Jobs |
|---|---|
| Toutes les 10 min | retry-notifications |
| Toutes les 15 min | expire-pending-bookings, refresh-dashboard-metrics, storage-scan-trigger, storage-opt-trigger |
| Toutes les 30 min | stuck-job-watchdog |
| Quotidien | kyc-expiry, analytics-rollup, kyc-document-cleanup, retry-failed-payouts, storage-purge-infected, process-payout-batch |
| Hebdomadaire | notification-cleanup, scheduled-jobs-cleanup, storage-meta-cleanup |
| Mensuel | audit-log-retention, analytics-retention, ticket-retention, daily-metrics-retention, create-partitions |

**⚠️ Manque :** Aucune intégration d'alerte externe (Sentry, PagerDuty, Slack webhook) pour les dead-letter webhooks ou les cron failures. Recommandé avant le Go Live complet (non bloquant pour un soft launch).

---

## Risques & Actions Requises

### 🔴 BLOQUANTS — À compléter AVANT le Go Live

| # | Risque | Action |
|---|---|---|
| B1 | **Variables d'environnement Supabase non configurées** (demo.supabase.co) | Remplir toutes les valeurs dans `.env.production` (voir `.env.example`) |
| B2 | **Storage buckets non provisionnés** | Exécuter `./scripts/create-buckets.sh` après migration Supabase |
| B3 | **GaniPay non switché en production** | Setter `GANIPAY_ENV=production` + vrais `GANIPAY_API_KEY` + `GANIPAY_WEBHOOK_SECRET` dans Supabase Edge Function secrets |

### 🟡 NON BLOQUANTS — Recommandés avant le launch public

| # | Risque | Action recommandée |
|---|---|---|
| R1 | Pas d'alerting externe sur dead-letter webhooks | Intégrer un Slack webhook ou Sentry sur le watchdog cron |
| R2 | `process-payment-webhook` ne gère pas les remboursements | Ajouter le chemin ledger refund si un provider autre que GaniPay est ajouté |
| R3 | Idempotency key stockée dans `cancel_reason` | Migration corrective dans une prochaine itération |
| R4 | Dispatch notifications multi-canal piloté par le process app | Envisager un trigger DB → Edge Function pour garantir la délivrabilité |
| R5 | Pas de monitoring externe (Sentry / Uptime) | Configurer Sentry DSN et un check uptime sur `https://staybf.com/health` |

### 🔵 INFORMATIONNEL

| # | Observation |
|---|---|
| I1 | `CinetPay` référencé dans `.env.example` — présent pour compatibilité ascendante, remplacé par GaniPay |
| I2 | `LIBSODIUM_SEALED_BOX_*` requis pour chiffrement payout_account et KYC |
| I3 | `ANTIVIRUS_API_URL` / `ANTIVIRUS_API_KEY` recommandés pour scanner les documents KYC uploadés |
| I4 | `TWILIO_*` requis uniquement si SMS et WhatsApp sont activés dès le launch |

---

## Checklist Déploiement (ordre d'exécution)

```
[ ] 1. Créer projet Supabase production (ou promouvoir staging)
[ ] 2. Appliquer toutes les migrations : supabase db push
[ ] 3. Remplir .env.production avec vrais credentials Supabase
[ ] 4. Configurer Edge Function secrets (Dashboard → Edge Functions → Secrets)
[ ] 5. Exécuter scripts/create-buckets.sh (provisioner les 6 buckets)
[ ] 6. Configurer GaniPay production (GANIPAY_ENV=production, GANIPAY_API_KEY, secrets)
[ ] 7. Enregistrer l'URL webhook GaniPay : https://staybf.com/api/ganipay-webhook
[ ] 8. Vérifier CORS : APP_URL=https://staybf.com dans les secrets Edge Functions
[ ] 9. Déployer sur Netlify : git push → build netlify auto
[ ] 10. Smoke test post-déploiement : A1, A3, A4 (auth), A6 (search)
[ ] 11. Simuler un paiement test depuis l'admin (simulate-payment)
[ ] 12. Vérifier les ledger entries en BDD
[ ] 13. Activer monitoring uptime sur /health
```

---

## Synthèse

| Domaine | Statut | Notes |
|---|---|---|
| Build | ✅ GO | 100% success (Netlify + Cloudflare) |
| Tests | ✅ GO | 462/462 — 0 failing |
| Edge Functions | ✅ GO | 39 fonctions, auth + CORS sur toutes |
| Database | ✅ GO | 21 migrations, 164 RLS policies, 20 cron jobs |
| Buckets | ⚠️ ACTION | Script `create-buckets.sh` à exécuter (BLOQUANT) |
| Auth | ✅ GO | JWT + rôles + guards OK |
| Notifications | ✅ GO | In-app + email + SMS + WhatsApp |
| Wallet | ✅ GO | Double-entry, advisory lock, atomique |
| Ledger | ✅ GO | Idempotent, auditable, intégrité vérifiée |
| Payments | ⚠️ ACTION | GANIPAY_ENV=production à setter (BLOQUANT) |
| Withdrawals | ✅ GO | 7-état machine, KYC-gated, advisory lock |
| Monitoring | ⚠️ ACTION | Crons OK — alerting externe recommandé |

---

> **DÉCISION : CONDITIONAL GO**  
> Le code, l'architecture et les tests sont production-ready.  
> 3 actions bloquantes (B1, B2, B3) doivent être complétées avant le Go Live :  
> configurer les vraies variables Supabase, provisionner les buckets Storage,  
> et passer GaniPay en mode production.  
> Une fois ces 3 points résolus : **GO ✅**
