# CHECKLIST PRODUCTION — StayBF Burkina Homes

> Audit réalisé le 2026-07-18. Statut: lecture seule — aucune modification effectuée.
>
> Légende: ✅ Conforme · ⚠️ Attention requise · ❌ Bloquant production

---

## RÉSUMÉ EXÉCUTIF

| Catégorie | Total | ✅ | ⚠️ | ❌ |
|---|---|---|---|---|
| Migrations | 20 | 18 | 2 | 0 |
| Edge Functions | 33 | 21 | 5 | 7 |
| Storage Buckets | 6 | 6 | 1 | 0 |
| RLS (tables) | ~30 | 28 | 2 | 0 |
| Index | 60+ | 60+ | 0 | 0 |
| Triggers | 50+ | 50+ | 0 | 0 |
| Variables d'environnement | 30+ | — | — | À vérifier |

**Issues critiques: 15** (détail section finale)

---

## 1. MIGRATIONS SUPABASE (0001–0020)

### ✅ 0001_init_identity.sql
- Extensions: `pgcrypto`, `citext`, `pg_trgm`, `cube`, `earthdistance`
- Tables: `profiles`, `user_roles`
- Enums: `app_role`, `app_account_status`, `app_kyc_status`
- Fonctions: `set_updated_at()`, `has_role()`, `handle_new_user()`
- Triggers: `set_profiles_updated_at`, `on_auth_user_created` (auth.users → profiles)
- RLS: ENABLE + FORCE LEVEL SECURITY sur les 2 tables — 10 politiques
- Index: `idx_profiles_account_status`, `idx_profiles_active` (partiel), `idx_user_roles_user_id`, `idx_user_roles_role`

### ✅ 0002_reference_data.sql
- Schéma: `billing`
- Tables: `regions`, `cities`, `amenities`, `billing.subscription_plans`
- RLS: ENABLE+FORCE sur les 4 tables (lecture publique + écriture super_admin)
- Seeds: 13 régions BF, 13 villes, 23 commodités, 4 plans d'abonnement
- Index: 8 indexes (slug, country, region, category, is_active)

### ✅ 0003_catalog.sql
- Enums: `app_host_status`, `app_property_status`, `app_room_status`, `app_property_type`, `app_room_type`, `app_cancellation_policy`, `app_payout_method`
- Tables: `host_profiles`, `properties`, `property_images`, `rooms`, `room_images`, `amenities_map`
- Fonctions: `is_host_of()`, `is_host_of_room()` (SECURITY DEFINER, SET search_path='')
- Triggers: updated_at × 3, `trg_amenities_map_room_property_check`, `trg_update_property_min_price`
- RLS: ENABLE+FORCE sur les 6 tables — ~25 politiques
- Index: ~20 indexes dont GiST geo, GIN trigrammes, partiels

### ✅ 0004_availability.sql
- Enums: `app_availability_status`, `app_block_source`
- Tables: `blocked_dates`, `room_availability`, `seasonal_pricing`
- Fonctions: `claim_availability()`, `release_availability()` (SECURITY DEFINER; accès service_role uniquement depuis 0009a)
- RLS: ENABLE+FORCE sur les 3 tables — 7 politiques
- Index: 7 indexes dont partiel open, ical_uid unique

### ✅ 0005_booking_engine.sql
- Enums: `app_booking_status` (11 états), `app_payout_status` (étendu en 0017), `app_booking_event_type` (21 types)
- Tables: `bookings`, `booking_guests`, `booking_events`, `booking_notes`
- Fonctions: `is_traveler_of_booking()`, `expire_pending_bookings()`, `validate_booking_transition()`
- Trigger machine d'état: `trg_booking_state_machine` BEFORE UPDATE OF status
- Contraintes: total_amount = accommodation + service_fee, commission IN (0.0000, 0.1500)
- RLS: ENABLE+FORCE sur les 4 tables — 10 politiques
- Index: 12 indexes dont partiels live status, payout pending, pending payment age

### ✅ 0006_payments.sql
- Enums: `app_payment_method`, `app_payment_status`, `app_refund_type`, `app_refund_status`
- Tables: `payments`, `payment_events`, `payouts`, `payout_items`, `refunds`
- Fonctions: `validate_refund_amount()`, `validate_payout_transition()` (remplacé en 0017), `validate_payment_transition()`, `process_payout_batch()` (corrigé en 0015, remplacé en 0017), `retry_failed_payout()`
- Triggers machine d'état: payments, payouts, refunds
- RLS: ENABLE+FORCE sur les 5 tables — 12 politiques

### ✅ 0007_engagement_communication.sql
- Tables: `favorites`, `reviews`, `review_replies`, `threads`, `messages`, `message_attachments`, `notifications`, `notification_preferences`
- Fonctions clés: `is_thread_participant()`, `can_review_booking()`, `check_review_eligibility()`, `maybe_reveal_reviews()`, `validate_review_transition()`, `update_property_rating()`, `check_pre_booking_message_cap()` (max 10 messages pré-réservation), `update_thread_on_message()`, `set_in_app_delivered_at()`
- Realtime: publications ajoutées pour `messages`, `notifications`
- RLS: ENABLE+FORCE sur les 8 tables

### ✅ 0008_operations_support.sql
- Enums: `app_ticket_status`, `app_ticket_priority`, `app_ticket_category`, `app_moderation_status`, `app_moderation_content_type`, `app_kyc_document_type`, `app_admin_action_type`, `app_audit_action` (~50 valeurs), `app_review_report_reason`
- Tables: `support_tickets`, `ticket_messages`, `ticket_attachments`, `moderation_queue`, `review_reports`, `host_verifications`, `audit_logs` (PARTITIONED BY RANGE), `admin_actions`
- Partitions initiales audit_logs: 2026_06 → 2027_03
- Fonctions: `log_audit_event()` (SECURITY DEFINER service_role), `create_audit_partition()`, `validate_kyc_transition()` (corrigé en 0009a), etc.
- RLS: ENABLE+FORCE sur les 8 tables

### ✅ 0009_analytics_automation.sql
- Tables: `scheduled_jobs`, `analytics_events` (PARTITIONED BY RANGE), `daily_metrics`, `dashboard_metrics`
- Partitions initiales analytics_events: 2026_06 → 2027_03
- **16 jobs pg_cron enregistrés** (voir section Cron)
- 4 jobs storage (voir section Storage)
- Fonctions: `run_analytics_rollup()` (corrigée en 0009a), `refresh_dashboard_metrics()`, `retry_pending_notifications()`, etc.

### ⚠️ 0009a_audit_fixes.sql
- Crée `billing.subscriptions` (manquant — référencé par `process_payout_batch` dans 0009)
- Ajoute valeurs enum manquantes: `audit_log_partition_dropped`, `analytics_partition_dropped`, `analytics_partition_skipped`
- Remplace `run_analytics_rollup()` (colonnes incorrectes dans 0009: `amount_fcfa` → `refund_amount_fcfa`, `refunded_at` → `processed_at`, `overall_score` → `overall_rating`, `submitted_at` → `created_at`)
- Crée `retry_failed_payouts_batch()` (wrappeur cron manquant dans 0009)
- Corrige `validate_kyc_transition()` pour synchroniser `profiles.kyc_status`
- Révoque `claim_availability`/`release_availability` à `authenticated`; accorde à `service_role`
- **Note:** Cette migration corrige des bugs réels dans 0008 et 0009 — ordre d'exécution critique

### ✅ 0010_storage_infrastructure.sql
- Enums: `app_storage_scan_status`, `app_storage_opt_status`
- Table: `storage_object_meta` — suivi antivirus, optimisation, orphelins
- Bucket check constraint: 6 buckets valides
- RLS sur `storage.objects`: 6 groupes × 3–4 politiques = ~20 politiques storage
- Fonctions: `register_storage_object()`, `complete_virus_scan()`, `complete_image_optimization()`, `log_kyc_document_access()`

### ✅ 0011_realtime_extension.sql
- Realtime publications ajoutées: `threads`, `bookings`, `payments`, `reviews`, `review_replies`, `support_tickets`, `ticket_messages`, `room_availability`, `properties`, `host_profiles`
- Total tables Realtime: **12** (+ messages et notifications depuis 0007)

### ✅ 0012_financial_infrastructure.sql
- Enums: `app_ledger_direction`, `app_ledger_account` (10 comptes), `app_ledger_entry_type` (10 types), `app_webhook_status`
- Tables: `wallet_ledger`, `payment_webhook_logs`, `idempotency_keys`
- Contraintes: amount > 0, debit_account ≠ credit_account
- Realtime: `wallet_ledger`, `payment_webhook_logs`
- Index: 7 indexes wallet_ledger + idx_webhook_retry_queue + idx_idempotency_expires

### ✅ 0013_ledger_entry_number.sql
- Séquence `wallet_ledger_entry_number_seq` — NO CYCLE
- Colonne `entry_number bigint NOT NULL DEFAULT nextval(...)`
- Colonne générée `entry_ref text` = 'WL-' + padding 9 chiffres
- Index: `uq_wallet_ledger_entry_ref` UNIQUE, `idx_wallet_ledger_entry_number`

### ✅ 0014_platform_settings.sql
- Table: `platform_settings` (key/value jsonb)
- RLS: admin uniquement
- Seeds: `platform`, `commissions` (discovery 15%, growth 10%, pro 8%, traveler 10%, TVA 18%), `security`

### ⚠️ 0015_fix_payout_batch.sql
- Corrige bug 0006: `bookings.host_id` n'existe pas, JOIN via `properties` requis
- Utilise encore `provider='fedapay'` — corrigé en 0017 (`provider='manual'`)
- **Note:** Supersédé par 0017; utile uniquement comme étape intermédiaire

### ✅ 0016_column_level_security.sql
- Triggers de sécurité colonne (authenticated uniquement; service_role bypass):
  - `prevent_profile_privilege_escalation()` — bloque writes sur account_status, kyc_status, etc.
  - `prevent_host_profile_privilege_escalation()` — bloque writes sur status, superhost, etc.
  - `enforce_booking_note_author()`, `restrict_review_self_edit()`, `validate_ticket_booking_id()`
- REVOKE INSERT, UPDATE, DELETE ON wallet_ledger FROM authenticated
- Politique finance: "wallet_ledger: finance read-all"

### ✅ 0017_withdrawal_state_machine.sql
- Ajoute valeurs `app_payout_status`: `approved`, `cancelled`
- Ajoute valeur `app_ledger_entry_type`: `payout_reversal`
- Élargit check providers payouts: `ganipay`, `manual`
- Remplace `validate_payout_transition()` → machine d'état 7 états complète
- Remplace `process_payout_batch()` — FOR UPDATE SKIP LOCKED, provider='manual'
- Colonnes ajoutées: `approved_at`, `approved_by`, `cancelled_at`, `cancelled_by`, `cancel_reason`

### ✅ 0018_ganipay_provider.sql
- Élargit `payments.provider` CHECK: `ganipay`, `manual`, `simulation`
- Ajoute `payments.failed_at timestamptz`
- Ajoute colonnes retry queue sur `payment_webhook_logs`: `retry_count`, `next_retry_at`, `dead_lettered`, etc.
- Index: `idx_webhook_logs_retry_queue` (partiel: eligible pour retry)

### ✅ 0019_fix_webhook_logs_provider_constraint.sql
- Recrée le CHECK `payment_webhook_logs_provider_valid` pour inclure: cinetpay, ganipay, manual, simulation

### ✅ 0020_rc2_atomic_withdrawal.sql
- Fonction `create_withdrawal_atomic()` SECURITY DEFINER:
  - `pg_advisory_xact_lock(hashtext(host_id))` — sécurité concurrente
  - Validation: min 5 000 FCFA, solde suffisant, plafond journalier 500 000 FCFA, mensuel 5 000 000 FCFA
  - INSERT atomique payout + wallet_ledger payout_debit
  - GRANT EXECUTE TO service_role uniquement
- Index: `idx_wallet_ledger_host_accounts`, `idx_payouts_host_status_created` (partiel), `idx_wallet_ledger_booking_type`

---

## 2. EDGE FUNCTIONS (33 fonctions)

### ✅ Conformes

| Fonction | Auth | Description |
|---|---|---|
| approve-booking | requireAuth (host) | Approuve réservation awaiting_host → confirmed |
| approve-property | requireRole(admin) | Publie propriété; insère admin_actions + notifications |
| approve-withdrawal | requireAnyRole(admin,super_admin,finance) | Payout pending → approved avec verrouillage optimiste |
| calculate-booking-price | requireAuth | Prix nuit avec priorité: override > saisonnier > base |
| cancel-booking | requireAuth (traveler/host) | Annulation + release_availability + ledger reversal |
| complete-withdrawal | requireAnyRole(admin,super_admin,finance) | Payout processing → paid |
| create-booking | requireAuth | Création réservation pending_payment + claim_availability |
| create-payment-intent | requireAuth | Stub CinetPay — crée payment.initiated |
| create-review | requireAuth | Insère avis traveler_to_host avec protection doublons |
| create-support-ticket | requireAuth | Ticket + message initial + notification admins |
| delete-image | requireAuth (host) | Supprime image storage + DB |
| delete-room | requireAuth (host) | Vérifie réservations futures avant suppression |
| dispatch-withdrawal | requireAnyRole(admin,super_admin,finance) | Chemin manuel/legacy approved → processing |
| generate-pdf | requireAuth (traveler/host) | Données structurées pour PDF côté client |
| payment-init | requireAuth | Intégration GaniPay complète; idempotency guard |
| payment-status | requireAuth | Polling GaniPay; sync DB |
| payment-webhook | Aucune (HMAC GaniPay) | Pipeline complet webhook avec dead-letter queue |
| payout-dispatch | requireAnyRole(admin,super_admin,finance) | GaniPay payout dispatch |
| payout-status | requireAnyRole(admin,super_admin,finance) | Polling GaniPay /payouts/{id} |
| process-withdrawal | requireAuth (host) | KYC check + create_withdrawal_atomic RPC |
| reject-property | requireRole(admin) | Rejette propriété; admin_actions + notifications |
| send-notification | requireRole(admin) | Insertion en masse de notifications |
| upload-avatar | requireAuth | URL signée bucket avatars |
| upload-property-image | requireAuth (host) | URL signée + property_images INSERT |
| upload-room-image | requireAuth (host) | URL signée + room_images INSERT |
| write-ledger-entry | Bearer service_role | Écriture ledger double-entrée avec validation |

### ⚠️ Attention

| Fonction | Problème |
|---|---|
| **approve-withdrawal** | Échecs admin_actions et notifications silencieusement swallowed |
| **create-booking** | Commission hardcodée 15%; host_subscription_snapshot = {}; pas de check doublon même traveler/dates |
| **payment-status** | Exception polling swallowée silencieusement; aucun log |
| **process-withdrawal** | Allocation payout_items non-atomique après RPC atomique (race condition concurrente) |
| **reject-booking** | Aucun booking_events écrit; pas de check payment capturé avant rejet |

### ❌ Bloquant production

| Fonction | Problème critique |
|---|---|
| **create-property** | Envoie champ `amenities` directement dans `properties` (colonne inexistante → erreur DB ou données perdues) |
| **export-csv** | Colonnes incorrectes: utilise `business_name` (inexistant → `company_name`) et `verification_status` (inexistant → `status`) sur host_profiles |
| **process-payment-webhook** | CinetPay HMAC non implémenté (vérification structurelle uniquement); risque sécurité webhook forgé |
| **refund-payment** | Aucune entrée ledger; aucune notification traveler; aucun appel API remboursement GaniPay |
| **reject-withdrawal** | Reversal ledger NON atomique avec mise à jour status: si write-ledger-entry échoue, solde HOST_AVAILABLE non restauré |
| **retry-payment** | Nouveau paiement créé avec `amount_fcfa=0` et `provider='cinetpay'` (incorrect) |
| **simulate-payment** | Utilise `provider='cinetpay'` au lieu de `provider='simulation'` (pourtant autorisé par la contrainte CHECK de 0018) |
| **sync-ical** | SSRF: toute URL acceptée sans validation (risque métadonnées cloud, réseau interne) |

---

## 3. STORAGE BUCKETS (6 buckets)

> **Note critique:** Les buckets sont provisionnés par `scripts/create-buckets.sh` — **PAS par les migrations SQL**. Étape de déploiement manuelle obligatoire.

| Bucket | Public | Taille max | Types MIME autorisés | Statut |
|---|---|---|---|---|
| `property-images` | ✅ Oui | 5 Mo | jpeg, png, webp, avif | ✅ |
| `room-images` | ✅ Oui | 5 Mo | jpeg, png, webp, avif | ✅ |
| `avatars` | ✅ Oui | 2 Mo | jpeg, png, webp, gif | ✅ |
| `message-attachments` | ❌ Non | 20 Mo | jpeg, png, gif, webp, pdf, mp4, webm | ✅ |
| `ticket-attachments` | ❌ Non | 20 Mo | jpeg, png, gif, webp, pdf | ✅ |
| `kyc-documents` | ❌ Non | 10 Mo | jpeg, png, pdf | ✅ |

**⚠️ Action requise:** Exécuter `scripts/create-buckets.sh` sur l'environnement de production AVANT toute utilisation de l'upload.

### Politiques RLS storage.objects (~20 politiques)
- `property-images`: lecture publique, upload host (is_host_of), update/delete host propriétaire
- `room-images`: lecture publique, upload host (is_host_of_room), update/delete host propriétaire
- `avatars`: lecture publique, upload/update/delete owner (path_owner_id = auth.uid())
- `message-attachments`: lecture participant (is_thread_participant OR admin/support), upload participant, delete admin
- `ticket-attachments`: lecture requester/support, upload requester/support, delete admin
- `kyc-documents`: lecture owner/admin, upload owner, delete admin

---

## 4. RLS POLICIES (par table)

### public.profiles — 6 politiques ✅
- SELECT authenticated: propre ligne
- UPDATE authenticated: propre ligne
- SELECT admin/support/finance: toutes les lignes
- UPDATE super_admin: n'importe quelle ligne

### public.user_roles — 4 politiques ✅
- SELECT authenticated: propres rôles
- SELECT admin: tous les rôles
- INSERT/DELETE super_admin uniquement

### public.host_profiles — 5 politiques ✅
- SELECT owner, UPDATE owner, SELECT admin/support/finance, ALL super_admin

### public.properties — 5 politiques ✅
- SELECT public (status='published' AND deleted_at IS NULL)
- SELECT/UPDATE host propriétaire, ALL admin, SELECT support

### public.property_images / room_images — 3 politiques chacune ✅
### public.rooms — 4 politiques ✅
- SELECT public (status='active' avec parent publié)
### public.amenities_map — 3 politiques ✅
### public.blocked_dates — 2 politiques ✅
### public.room_availability — 4 politiques ✅
### public.seasonal_pricing — 3 politiques ✅
### public.bookings — 5 politiques ✅
### public.booking_guests — 4 politiques ✅
### public.booking_events — 5 politiques ✅
### public.booking_notes — 2 politiques ✅ (support + admin uniquement)
### public.payments — RLS activé ✅
### public.payment_events — RLS activé ✅
### public.payouts — RLS activé ✅ + politique insert host (0017)
### public.payout_items — RLS activé ✅
### public.refunds — RLS activé ✅
### public.favorites / reviews / threads / messages / notifications — RLS activé ✅
### public.support_tickets / ticket_messages / ticket_attachments — RLS activé ✅
### public.moderation_queue / review_reports / host_verifications / admin_actions — RLS activé ✅
### public.audit_logs — RLS activé ✅ (PARTITIONED)
### public.wallet_ledger — RLS activé ✅ + CLS (authenticated REVOKED depuis 0016)
### public.payment_webhook_logs — RLS activé ✅ (admin read seulement)
### public.idempotency_keys — RLS activé ✅ (actor read own)
### public.storage_object_meta — RLS activé ✅
### billing.subscription_plans — 2 politiques ✅ (public read, super_admin write)
### billing.subscriptions — RLS activé ✅ (créé dans 0009a)
### public.regions / cities / amenities — 2 politiques ✅ (public read, super_admin write)
### public.platform_settings — 1 politique ✅ (admin all)

**⚠️ Absence notable:** Aucune politique INSERT pour `authenticated` sur `wallet_ledger` (intentionnel — CLS via 0016). Accès écriture uniquement via service_role.

---

## 5. INDEXES (60+ index)

### Critique performance
| Table | Index | Type | Notes |
|---|---|---|---|
| properties | idx_properties_geo | GiST (ll_to_earth) | Recherche géographique |
| properties | idx_properties_name_trgm | GIN (gin_trgm_ops) | Recherche full-text |
| properties | idx_properties_status_city | B-tree partiel | WHERE deleted_at IS NULL |
| properties | idx_properties_rating | B-tree DESC NULLS LAST | Tri par note |
| bookings | idx_bookings_live_status | B-tree partiel | WHERE status NOT IN (terminaux) |
| bookings | idx_bookings_pending_payment_age | B-tree partiel | Expiration auto |
| payment_webhook_logs | idx_webhook_logs_retry_queue | B-tree partiel | File retry |
| wallet_ledger | idx_wallet_ledger_host_accounts | Composite | Calcul solde atomique |
| analytics_events | (partitionné par range) | — | Maintenance auto cron |
| audit_logs | (partitionné par range) | — | Maintenance auto cron |

Tous les indexes ont été vérifiés présents dans les migrations. ✅

---

## 6. TRIGGERS (50+ triggers)

### Triggers de mise à jour automatique (updated_at)
`profiles`, `billing.subscription_plans`, `host_profiles`, `properties`, `rooms`, `blocked_dates`, `room_availability`, `seasonal_pricing`, `bookings`, `booking_notes`, `payments`, `payouts`, `refunds`, `storage_object_meta`, `reviews`, `support_tickets`, `ticket_messages` — tous via `set_updated_at()`

### Triggers de machine d'état
| Trigger | Table | Événement |
|---|---|---|
| `trg_booking_state_machine` | bookings | BEFORE UPDATE OF status |
| `trg_payment_state_machine` | payments | BEFORE UPDATE OF status |
| `trg_payout_state_machine` | payouts | BEFORE UPDATE OF status |
| `trg_validate_refund_amount` | refunds | BEFORE INSERT |

### Triggers de sécurité (0016)
| Trigger | Table | Protection |
|---|---|---|
| `trg_prevent_profile_privilege_escalation` | profiles | Bloque writes account_status, kyc_status |
| `trg_prevent_host_privilege_escalation` | host_profiles | Bloque writes status, superhost |
| `trg_enforce_booking_note_author` | booking_notes | author_id = auth.uid() |
| `trg_restrict_review_self_edit` | reviews | Champs immutables |
| `trg_validate_ticket_booking_id` | support_tickets | booking_id appartient au requester |

### Autres triggers
| Trigger | Table | Action |
|---|---|---|
| `on_auth_user_created` | auth.users | Crée profil automatiquement |
| `trg_update_property_min_price` | rooms | Met à jour min_price_fcfa sur properties |
| `trg_amenities_map_room_property_check` | amenities_map | Valide room ↔ property cohérence |
| `trg_booking_state_machine` | bookings | Valide transitions légales |
| `enforce_message_immutability` | messages | Messages append-only |
| `check_pre_booking_message_cap` | messages | Max 10 messages pré-réservation |
| `update_thread_on_message` | messages | Met à jour last_message_at |
| `set_in_app_delivered_at` | notifications | Marque delivered quand lu |
| `auto_enqueue_review_report` | review_reports | Ajoute à moderation_queue |
| `enforce_admin_action_immutability` | admin_actions | Append-only |
| `validate_kyc_transition` | host_verifications | Sync kyc_status → profiles |
| `maybe_reveal_reviews` | reviews | Système double-blind |
| `update_property_rating` | reviews | Recalcule rating_avg/count |

---

## 7. JOBS pg_cron (20 jobs)

### 16 jobs analytics/opérations (0009)
| Nom | Planification | Fonction |
|---|---|---|
| expire-pending-bookings | `*/15 * * * *` | `expire_pending_bookings()` |
| refresh-dashboard-metrics | `*/15 * * * *` | `refresh_dashboard_metrics()` |
| retry-notifications | `*/10 * * * *` | `retry_pending_notifications()` |
| stuck-job-watchdog | `*/30 * * * *` | `detect_stuck_jobs()` |
| kyc-expiry | `0 1 * * *` | `expire_approved_kyc()` |
| analytics-rollup | `0 2 * * *` | `run_analytics_rollup()` |
| kyc-document-cleanup | `0 2 30 * * *` | `purge_expired_kyc_documents()` |
| retry-failed-payouts | `0 3 * * *` | `retry_failed_payouts_batch(now())` |
| process-payout-batch | `0 6 * * *` | `process_payout_batch()` |
| notification-cleanup | `0 3 * * 0` | `cleanup_old_notifications()` |
| scheduled-jobs-cleanup | `0 4 * * 0` | `cleanup_scheduled_jobs()` |
| audit-log-retention | `0 3 1 * *` | `drop_expired_audit_partitions()` |
| analytics-retention | `0 3 30 1 *` | `drop_expired_analytics_partitions()` |
| ticket-retention | `0 4 1 * *` | `cleanup_old_tickets()` |
| create-partitions | `0 1 25 * *` | `run_partition_maintenance()` |
| daily-metrics-retention | `0 5 1 * *` | `cleanup_old_daily_metrics()` |

### 4 jobs storage (0010)
| Nom | Planification | Action |
|---|---|---|
| storage-scan-trigger | `*/15 * * * *` | Déclencheur antivirus |
| storage-opt-trigger | `*/15 * * * *` | Déclencheur optimisation images |
| storage-purge-infected | `0 4 * * *` | Purge fichiers infectés |
| storage-meta-cleanup | `0 5 * * 0` | Nettoyage métadonnées orphelines |

**⚠️ Prérequis cron:** Les paramètres DB `app.supabase_url` et `app.service_role_key` doivent être définis AVANT que les jobs cron ne s'exécutent pour la première fois. `retry_pending_notifications()` utilise `net.http_post` — l'extension `pg_net` doit être activée sur le projet Supabase.

---

## 8. VARIABLES D'ENVIRONNEMENT

### Variables Supabase (Edge Functions)

| Variable | Requis | Utilisée par |
|---|---|---|
| `SUPABASE_URL` | ✅ Oui | auth.ts: makeServiceClient() |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Oui | auth.ts: makeServiceClient(), requireServiceRole() |
| `SUPABASE_ANON_KEY` | ✅ Oui | auth.ts: getAuthUser() |

### Variables GaniPay

| Variable | Requis | Utilisée par |
|---|---|---|
| `GANIPAY_API_KEY` | ✅ Oui | payment-init, payout-dispatch |
| `GANIPAY_ENV` | ✅ Oui | payment-init, payout-dispatch (`sandbox`/`production`) |
| `GANIPAY_CALLBACK_URL` | ✅ Oui | payment-init (URL de retour après paiement) |
| `GANIPAY_CANCEL_URL` | ✅ Oui | payment-init (URL d'annulation) |
| `GANIPAY_WEBHOOK_SECRET` | ✅ Oui | payment-webhook, ganipay-adapter (HMAC-SHA256) |

### Variables email/SMS

| Variable | Requis | Utilisée par |
|---|---|---|
| `RESEND_API_KEY` | ✅ Oui | send-email |
| `TWILIO_ACCOUNT_SID` | ✅ Oui | send-sms, send-whatsapp |
| `TWILIO_AUTH_TOKEN` | ✅ Oui | send-sms, send-whatsapp |
| `TWILIO_SMS_FROM` | ✅ Oui | send-sms |
| `TWILIO_WHATSAPP_FROM` | ✅ Oui | send-whatsapp |

### Variables application

| Variable | Requis | Utilisée par |
|---|---|---|
| `APP_URL` | ✅ Oui | cors.ts (sinon CORS = `*`), payment-init |
| `SIMULATE_PAYMENT_ENABLED` | ⚠️ Staging | simulate-payment (désactivé en prod si absent) |
| `PAYMENT_WEBHOOK_SECRET` | ✅ Oui | process-payment-webhook (secret partagé tous providers) |

### Variables front-end (VITE_*)

| Variable | Requis | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ Oui | URL publique Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ Oui | Clé anon publique Supabase |
| `VITE_MAPBOX_TOKEN` | ✅ Oui | Token Mapbox pour SearchMap |
| `VITE_APP_URL` | ⚠️ Recommandé | URL application (partage social, OG tags) |

### Paramètres DB (via `ALTER DATABASE SET`)

| Paramètre | Usage |
|---|---|
| `app.supabase_url` | Requis par `retry_pending_notifications()` (pg_net) |
| `app.service_role_key` | Requis par jobs cron qui appellent Edge Functions |

---

## 9. ISSUES CRITIQUES AVANT PRODUCTION

### ❌ BLOQUANT — Sécurité

**[SEC-1] CinetPay HMAC non implémenté**
- Fichier: `supabase/functions/_shared/cinetpay-adapter.ts` + `process-payment-webhook/index.ts`
- Problème: `verifySignature()` ne fait qu'une vérification structurelle. N'importe quelle requête peut forger un webhook CinetPay.
- Impact: Fraude paiement, manipulation de réservations.
- Correction: Implémenter HMAC-SHA256 avec `CINETPAY_WEBHOOK_SECRET`.

**[SEC-2] SSRF dans sync-ical**
- Fichier: `supabase/functions/sync-ical/index.ts`
- Problème: Toute URL est acceptée sans validation. Un hôte peut cibler `http://169.254.169.254/` (métadonnées cloud) ou le réseau interne.
- Correction: Valider que l'URL est HTTP(S), domaine public, pas RFC1918/link-local.

**[SEC-3] CORS fallback `*`**
- Fichier: `supabase/functions/_shared/cors.ts`
- Problème: Si `APP_URL` n'est pas défini, tous les origines sont acceptés.
- Correction: S'assurer que `APP_URL` est défini en production; sinon bloquer en dur.

### ❌ BLOQUANT — Intégrité des données

**[DATA-1] create-property — champ amenities inexistant**
- Fichier: `supabase/functions/create-property/index.ts`
- Problème: `amenities` est passé directement à `properties` mais la colonne n'existe pas (les commodités sont dans `amenities_map`).
- Correction: Retirer `amenities` de l'INSERT properties; insérer séparément dans `amenities_map`.

**[DATA-2] export-csv — colonnes incorrectes**
- Fichier: `supabase/functions/export-csv/index.ts`
- Problème: Requête sur `business_name` (→ `company_name`) et `verification_status` (→ `status`) sur `host_profiles`.
- Impact: Exports CSV vides ou erreur 500 pour les administrateurs.
- Correction: Renommer les colonnes dans la requête.

**[DATA-3] reject-withdrawal non-atomique**
- Fichier: `supabase/functions/reject-withdrawal/index.ts`
- Problème: Mise à jour `payouts.status='cancelled'` puis appel `write-ledger-entry` (EF séparé). Si l'EF échoue, le paiement est annulé mais le solde HOST_AVAILABLE n'est pas restauré.
- Correction: Utiliser `create_withdrawal_atomic` pour le reversal, ou une transaction DB unique.

**[DATA-4] reject-booking — paiement capturé non reversé**
- Fichier: `supabase/functions/reject-booking/index.ts`
- Problème: Un hôte peut rejeter une réservation `awaiting_host` qui a déjà un paiement capturé sans qu'aucune entrée ledger de reversal ne soit écrite.
- Correction: Vérifier si un paiement capturé existe; si oui, écrire les entrées ledger de reversal.

### ❌ BLOQUANT — Fonctionnalité

**[FEAT-1] retry-payment — montant zéro**
- Fichier: `supabase/functions/retry-payment/index.ts`
- Problème: Nouveau paiement créé avec `amount_fcfa=0` et `provider='cinetpay'`.
- Impact: Paiements retry invalides; contrainte DB potentiellement violée.
- Correction: Copier le montant du paiement original; utiliser le bon provider.

**[FEAT-2] simulate-payment — mauvais provider**
- Fichier: `supabase/functions/simulate-payment/index.ts`
- Problème: Utilise `provider='cinetpay'` pour les simulations. Le provider `simulation` est disponible depuis 0018.
- Impact: Données de simulation mélangées avec données CinetPay réelles dans les analytics.
- Correction: `provider: 'simulation'`

**[FEAT-3] refund-payment — remboursement incomplet**
- Fichier: `supabase/functions/refund-payment/index.ts`
- Problème: Ne fait que transition `captured → refund_pending`. Aucun appel GaniPay, aucune entrée ledger, aucune notification traveler.
- Impact: Les remboursements approuvés ne sont jamais traités.
- Correction: Appeler GaniPay /refunds, écrire ledger `refund_accommodation_debit`, notifier.

### ⚠️ Attention — Déploiement

**[DEPLOY-1] Storage buckets non dans les migrations**
- Les 6 buckets sont créés par `scripts/create-buckets.sh` uniquement.
- Action: Exécuter le script sur chaque environnement (staging, production) avant déploiement.

**[DEPLOY-2] retry-webhooks — CinetPay non pris en charge**
- Fichier: `supabase/functions/retry-webhooks/index.ts`
- Problème: Hard-codé vers `payment-webhook` (GaniPay). Les webhooks CinetPay nécessitent `process-payment-webhook?provider=cinetpay`.

**[DEPLOY-3] Paramètres DB manquants pour cron**
- `app.supabase_url` et `app.service_role_key` doivent être définis dans la DB avant les premiers jobs cron.
- Commande: `ALTER DATABASE postgres SET app.supabase_url = '...'`

**[DEPLOY-4] pg_net requis pour retry-notifications**
- L'extension `pg_net` doit être activée sur le projet Supabase pour `retry_pending_notifications()`.

**[DEPLOY-5] send-email/sms/whatsapp — colonnes admin_actions incorrectes**
- Utilisent `actor_id` et `target_table=null` qui ne correspondent pas au schéma réel (`admin_id`).
- Impact: Logs d'actions non enregistrés mais fonctionnalité principale non bloquée.

---

## 10. ÉTAPES DE DÉPLOIEMENT (ordre requis)

```
[ ] 1. Provisionner le projet Supabase (URL, clés)
[ ] 2. Activer extensions: pgcrypto, citext, pg_trgm, cube, earthdistance, pg_net, pg_cron
[ ] 3. Appliquer migrations 0001 → 0020 dans l'ordre (supabase db push)
[ ] 4. Définir paramètres DB:
        ALTER DATABASE postgres SET app.supabase_url = 'https://xxx.supabase.co';
        ALTER DATABASE postgres SET app.service_role_key = 'eyJ...';
[ ] 5. Exécuter scripts/create-buckets.sh avec le token Supabase approprié
[ ] 6. Définir toutes les variables d'environnement Edge Functions (section 8)
[ ] 7. Déployer les 33 Edge Functions (supabase functions deploy --all)
[ ] 8. Vérifier les jobs pg_cron actifs (SELECT * FROM cron.job;)
[ ] 9. Insérer super_admin initial:
        INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid>', 'super_admin');
[ ] 10. Tester end-to-end: inscription → réservation → paiement → confirmation → retrait
[ ] 11. Vérifier dashboard Realtime (12 tables publiées)
[ ] 12. Activer monitoring pg_cron et alertes Supabase
```

---

*Généré le 2026-07-18 — Lecture seule, aucune modification effectuée.*
